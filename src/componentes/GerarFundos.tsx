import { useEffect, useRef, useState } from "react";
import { urlDaMidia } from "../db";
import { mensagemDeErro, salvarCena } from "../nuvem";
import type { Cena } from "../tipos";
import { emAndamento, useProcessamento } from "../processamento";

type Estado = { titulo: string; texto: string; tipo: "feito" | "erro" | "andando" };
const CHAVE_AUTO = "dubla-brasil:gerar-fundo";

/** Celular ou tablet (app instalado ou navegador): a separação com IA é pesada demais para rodar sozinha. */
const ehCelular = () => /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || ("Capacitor" in window && (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.() === true);

/** Cena que ainda precisa da IA: sem trilha de fundo, ou música sem a voz separada (para a nota). */
const precisa = (c: Cena) => !!c.caminhos?.video && (!c.caminhos?.fundo || (c.tipo === "musica" && !c.caminhos?.voz));

/**
 * Admin: gera a "trilha de fundo" (o som da cena SEM as vozes: música e efeitos) com a IA de separação. É o que deixa
 * a dublagem limpa. Nas músicas também guarda a voz do cantor, para dar a nota de afinação no Modo Cantar.
 * Logo depois de salvar uma cena nova sem trilha, começa sozinho para ela.
 */
export default function GerarFundos({ cenas, aoTerminar }: { cenas: Cena[]; aoTerminar: () => void }) {
  const [rodando, setRodando] = useState(false);
  const [estados, setEstados] = useState<Estado[]>([]);
  const caixa = useRef<HTMLElement>(null);
  const parar = useRef(new AbortController());
  // Saiu da Administração: a IA para (não fica rodando escondida, pesando no aparelho).
  useEffect(() => () => parar.current.abort(), []);
  const [avisoCelular, setAvisoCelular] = useState(false);
  // As que a fila automática já está preparando ficam de fora (não faz a mesma cena duas vezes).
  const naFila = new Set(emAndamento(useProcessamento()).map((t) => t.id));
  const semFundo = cenas.filter((c) => precisa(c) && !naFila.has(c.id));

  const rodar = async (fila: Cena[]) => {
    setRodando(true);
    const lista: Estado[] = fila.map((c) => ({ titulo: c.titulo.trim(), texto: "na fila…", tipo: "andando" }));
    setEstados([...lista]);
    const mudar = (i: number, e: Partial<Estado>) => {
      lista[i] = { ...lista[i], ...e };
      setEstados([...lista]);
    };
    const { gerarTrilhaDeFundo } = await import("../separacao");
    let feitas = 0;
    for (let i = 0; i < fila.length; i++) {
      const c = fila[i];
      try {
        const inicio = Date.now();
        const url = await urlDaMidia(c.video);
        const musica = c.tipo === "musica";
        const { arquivo, voz } = await gerarTrilhaDeFundo(url, (p) => mudar(i, { texto: `${p.detalhe} ${Math.round(p.fracao * 100)}%` }), { comVoz: musica, sinal: parar.current.signal });
        mudar(i, { texto: "enviando…" });
        await salvarCena(c, { fundo: arquivo, ...(voz ? { voz } : {}) });
        feitas++;
        mudar(i, { texto: `✅ ${musica ? "instrumental e voz separados" : "trilha de fundo pronta"} (${Math.max(1, Math.round((Date.now() - inicio) / 60000))} min)`, tipo: "feito" });
      } catch (e) {
        if (parar.current.signal.aborted) return;
        mudar(i, { texto: `não deu: ${mensagemDeErro(e)}`, tipo: "erro" });
      }
    }
    setRodando(false);
    if (feitas) aoTerminar();
  };

  // Cena nova acabou de ser salva sem trilha: começa sozinho (só para ela).
  const jaComecou = useRef(false);
  useEffect(() => {
    if (jaComecou.current) return;
    let id: string | null = null;
    try {
      id = sessionStorage.getItem(CHAVE_AUTO);
    } catch {
      /* sem armazenamento */
    }
    const alvo = id ? cenas.find((c) => c.id === id && precisa(c)) : undefined;
    if (!alvo) return;
    jaComecou.current = true;
    try {
      sessionStorage.removeItem(CHAVE_AUTO);
    } catch {
      /* ok */
    }
    caixa.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    // No celular a IA é pesada demais para começar sozinha: avisa e deixa o botão (melhor no computador).
    if (ehCelular()) setAvisoCelular(true);
    else void rodar([alvo]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cenas]);

  if (!cenas.length) return null;

  return (
    <section className="cartao pilha" style={{ gap: 8 }} ref={caixa}>
      <div className="linha entre" style={{ flexWrap: "wrap", gap: 8 }}>
        <div>
          <b>✨ Trilha de fundo com IA (dublagem limpa)</b>
          <div className="suave pequeno">
            {semFundo.length
              ? `${semFundo.length} de ${cenas.length} ${cenas.length === 1 ? "cena está" : "cenas estão"} sem trilha de fundo. A IA tira as vozes e deixa a música e os efeitos: na sua fala sai só a voz do personagem.`
              : "Todas as cenas têm trilha de fundo. ✅"}
          </div>
        </div>
        {semFundo.length > 0 && (
          <button className="botao botao-primario" disabled={rodando} onClick={() => void rodar(semFundo)}>
            {rodando ? "Gerando…" : `✨ Gerar ${semFundo.length === 1 ? "a trilha" : `as ${semFundo.length} trilhas`}`}
          </button>
        )}
      </div>
      {avisoCelular && !rodando && (
        <p className="pequeno" style={{ margin: 0 }}>
          📱 Cena salva! A trilha de fundo é gerada por uma IA pesada: para o celular não travar, faça isso no <b>computador</b> (Administração → ✨ Gerar). Se quiser mesmo pelo celular, toque no botão acima e deixe esta tela aberta, sem usar o app, até terminar.
        </p>
      )}
      {rodando && (
        <p className="pequeno" style={{ margin: 0 }}>
          ⏳ A IA está trabalhando. Deixe esta página aberta até terminar (alguns minutos por cena).
        </p>
      )}
      {semFundo.length > 0 && !rodando && !estados.length && (
        <p className="suave pequeno" style={{ margin: 0 }}>
          Melhor no Chrome do computador: a IA (180 MB, baixa uma vez só) leva alguns minutos por cena. Deixe a página aberta até terminar.
        </p>
      )}
      {estados.length > 0 && (
        <ul className="lista-otimizar" aria-label="Trilhas de fundo">
          {estados.map((e, i) => (
            <li key={i} className={e.tipo}>
              <b>{e.titulo}</b> <span className="suave">· {e.texto}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
