import { useState } from "react";
import { urlDaMidia } from "../db";
import { mensagemDeErro, salvarCena } from "../nuvem";
import type { Cena } from "../tipos";

type Estado = { titulo: string; texto: string; tipo: "feito" | "erro" | "andando" };

/**
 * Admin: gera a "trilha de fundo" (o som da cena SEM as vozes: música e efeitos) de todas as cenas que ainda não
 * têm, com a IA de separação. É o que deixa a dublagem limpa: na fala da Rose sai só a voz dela (a música continua)
 * e entra a voz de quem dubla; na fala do Jack toca o original.
 */
export default function GerarFundos({ cenas, aoTerminar }: { cenas: Cena[]; aoTerminar: () => void }) {
  const [rodando, setRodando] = useState(false);
  const [estados, setEstados] = useState<Estado[]>([]);
  const semFundo = cenas.filter((c) => c.caminhos?.video && !c.caminhos?.fundo);
  if (!cenas.length) return null;

  const rodar = async () => {
    setRodando(true);
    const fila = semFundo;
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
        const { arquivo } = await gerarTrilhaDeFundo(url, (p) => mudar(i, { texto: `${p.detalhe} ${Math.round(p.fracao * 100)}%` }));
        mudar(i, { texto: "enviando…" });
        await salvarCena(c, { fundo: arquivo });
        feitas++;
        mudar(i, { texto: `✅ trilha de fundo pronta (${Math.max(1, Math.round((Date.now() - inicio) / 60000))} min)`, tipo: "feito" });
      } catch (e) {
        mudar(i, { texto: `não deu: ${mensagemDeErro(e)}`, tipo: "erro" });
      }
    }
    setRodando(false);
    if (feitas) aoTerminar();
  };

  return (
    <section className="cartao pilha" style={{ gap: 8 }}>
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
          <button className="botao botao-primario" disabled={rodando} onClick={() => void rodar()}>
            {rodando ? "Gerando…" : `✨ Gerar ${semFundo.length === 1 ? "a trilha" : `as ${semFundo.length} trilhas`}`}
          </button>
        )}
      </div>
      {semFundo.length > 0 && !rodando && !estados.length && (
        <p className="suave pequeno" style={{ margin: 0 }}>
          Use o Chrome do computador: a IA (180 MB, baixa uma vez só) leva alguns minutos por cena. Deixe a página aberta até terminar.
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
