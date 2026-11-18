import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAdmin } from "../admin";
import Avatar from "../componentes/Avatar";
import { Capa } from "../componentes/CartaoCena";
import TesteMicrofone from "../componentes/TesteMicrofone";
import { db } from "../db";
import { buscarCena, dubsDaCena, useCarregar, useFormatoDoVideo, useMidiasDaCena } from "../ganchos";
import { estaPublicada, type Cena, type Dub, type DuetoBase } from "../tipos";
import { obterPublicacao } from "../galeria";
import { dataCurta, formatarTempo, novoId } from "../util";
import { PRECO, usarDublagem, usePlano } from "../plano";

export default function EscolherPapel() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const duetoId = params.get("dueto");
  const cena = useCarregar(() => buscarCena(id), [id]);
  // Dueto: o dub da galeria com quem a pessoa vai dublar junto.
  const dueto = useCarregar<DuetoBase | null>(async () => {
    if (!duetoId) return null;
    const p = await obterPublicacao(duetoId);
    if (!p) throw new Error("Esse dub não está mais na galeria.");
    return { publicacaoId: p.id, video: p.video, apelido: p.apelido, papeis: p.papeis };
  }, [duetoId]);
  if (cena.carregando || dueto.carregando) return <p className="suave">Carregando…</p>;
  if (cena.erro) return <p className="alerta">{cena.erro}</p>;
  if (dueto.erro)
    return (
      <div className="vazio">
        <h2>Dueto indisponível</h2>
        <p>{dueto.erro}</p>
        <Link className="botao" to={`/cena/${id}`}>
          Dublar a cena sozinho
        </Link>
      </div>
    );
  if (!cena.dado)
    return (
      <div className="vazio">
        <h2>Cena não encontrada</h2>
        <p>Ela pode ter sido removida pelo administrador.</p>
        <Link className="botao" to="/cenas">
          Ver cenas
        </Link>
      </div>
    );
  return <Pronto key={`${cena.dado.id}-${duetoId ?? ""}`} c={cena.dado} dueto={dueto.dado ?? null} />;
}

const mesmoNome = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

function Pronto({ c, dueto }: { c: Cena; dueto: DuetoBase | null }) {
  const dubs = useCarregar(() => dubsDaCena(c.id), [c.id]);
  const { urls } = useMidiasDaCena(c);
  // Dueto: os personagens que a outra pessoa já dublou ficam com a voz dela.
  const doOutro = (pid: string) => !!dueto && dueto.papeis.some((n) => mesmoNome(n, c.personagens.find((p) => p.id === pid)?.nome ?? ""));
  const livres = c.personagens.filter((p) => !doOutro(p.id) && c.falas.some((f) => f.personagemId === p.id));
  // Como no modo solo: começa com todos os personagens; toque para tirar quem você não quer dublar.
  const [papeis, setPapeis] = useState<string[]>(() => (dueto ? livres : c.personagens).map((p) => p.id));
  const [verCena, setVerCena] = useState(false);
  const [previa, setPrevia] = useState<HTMLVideoElement | null>(null);
  const formato = useFormatoDoVideo(previa);
  const admin = useAdmin();
  const navegar = useNavigate();
  const plano = usePlano();
  const [semDublagens, setSemDublagens] = useState(false);
  const [iniciando, setIniciando] = useState(false);
  const [erroLimite, setErroLimite] = useState<string | null>(null);

  const alternar = (pid: string) => !doOutro(pid) && setPapeis((atual) => (atual.includes(pid) ? atual.filter((x) => x !== pid) : [...atual, pid]));
  const falasDe = (pid: string) => c.falas.filter((f) => f.personagemId === pid).length;
  const minhasFalas = c.falas.filter((f) => papeis.includes(f.personagemId)).length;
  const escolhidos = c.personagens.filter((p) => papeis.includes(p.id));

  const comecar = async () => {
    setErroLimite(null);
    setIniciando(true);
    try {
      if (!(await usarDublagem())) {
        setSemDublagens(true);
        return;
      }
    } catch (e) {
      setErroLimite(e instanceof Error ? e.message : String(e));
      return;
    } finally {
      setIniciando(false);
    }
    const agora = Date.now();
    const dub: Dub = {
      id: novoId(),
      cenaId: c.id,
      papeis,
      tomadas: {},
      ...(dueto ? { base: dueto } : {}),
      nome: `${c.titulo} — ${escolhidos.map((p) => p.nome).join(" e ")}${dueto ? ` (dueto com @${dueto.apelido})` : ""}`,
      criadoEm: agora,
      atualizadoEm: agora,
    };
    await db.salvarDub(dub);
    navegar(`/estudio/${dub.id}`);
  };

  const legenda =
    escolhidos.length === 0
      ? "Toque nos personagens que você vai dublar"
      : escolhidos.length === c.personagens.length && c.personagens.length > 1
        ? "Todos com a sua voz"
        : `Você dubla: ${escolhidos.map((p) => p.nome).join(" e ")}`;

  return (
    <div className="pronto">
      <div className="linha entre">
        <Link to="/cenas" className="pequeno">
          ← Cenas
        </Link>
        {admin.aberto && (
          <span className="linha" style={{ gap: 6 }}>
            <span className="etiqueta">{estaPublicada(c) ? "Publicada" : "Oculta"}</span>
            <Link className="botao botao-pequeno" to={`/admin/cena/${c.id}`}>
              ✏️ Editar
            </Link>
          </span>
        )}
      </div>

      <div className="pronto-cabeca">
        <h1 className="pronto-titulo">
          Pronto para <span className="destaque">dublar?</span>
        </h1>
        <div className="pronto-cena">{c.titulo}</div>
        <div className="suave pequeno">
          {c.falas.length} {c.falas.length === 1 ? "fala" : "falas"} · {c.personagens.length} {c.personagens.length === 1 ? "personagem" : "personagens"} ·{" "}
          {formatarTempo(c.duracaoMs, false)}
        </div>
      </div>

      {dueto && (
        <div className="aviso-dueto pilha" style={{ gap: 4 }}>
          <strong>🎭 Dueto com @{dueto.apelido}</strong>
          {livres.length ? (
            <span className="pequeno">
              {dueto.papeis.join(" e ")} {dueto.papeis.length === 1 ? "fica" : "ficam"} com a voz de @{dueto.apelido}. Você dubla quem sobrou, e o vídeo final sai com as duas vozes.
            </span>
          ) : (
            <span className="pequeno">
              @{dueto.apelido} já dublou todos os personagens desta cena. <Link to={`/cena/${c.id}`}>Dublar a cena sozinho</Link>
            </span>
          )}
        </div>
      )}

      <div className="elenco" role="group" aria-label="Personagens">
        {c.personagens.map((p) => {
          const meu = papeis.includes(p.id);
          const outro = doOutro(p.id);
          return (
            <button
              key={p.id}
              className={`ator ${meu ? "escolhido" : ""} ${outro ? "de-outro" : ""}`}
              aria-pressed={meu}
              aria-disabled={outro}
              aria-label={`${p.nome}, ${falasDe(p.id)} ${falasDe(p.id) === 1 ? "fala" : "falas"}${meu ? ", com a sua voz" : outro ? `, com a voz de @${dueto?.apelido}` : ""}`}
              onClick={() => alternar(p.id)}
            >
              <span className="ator-foto">
                <Avatar personagem={p} tamanho={76} />
                {meu && <span className="ator-marca">🎙️</span>}
              </span>
              <span className="ator-nome">{p.nome}</span>
              <span className="ator-falas">{outro ? `🎭 @${dueto?.apelido}` : `${falasDe(p.id)} ${falasDe(p.id) === 1 ? "fala" : "falas"}`}</span>
            </button>
          );
        })}
      </div>
      <div className="legenda-elenco">
        <span>{legenda}</span>
      </div>

      {verCena ? (
        <div className={`palco ${formato.vertical ? "vertical" : ""}`} style={formato.estilo}>
          {urls && <video ref={setPrevia} crossOrigin="anonymous" src={dueto?.video ?? urls.video} controls autoPlay playsInline preload="metadata" />}
        </div>
      ) : (
        <button className="cartao previa-cena" onClick={() => setVerCena(true)} aria-label="Assistir à cena original">
          <Capa cena={c} />
          <span className="previa-play">{dueto ? `▶ Assistir ao dub de @${dueto.apelido}` : "▶ Assistir à cena original"}</span>
        </button>
      )}

      <TesteMicrofone />

      <div className="pronto-acao">
        <button className="botao botao-primario botao-grande cta-estudio" disabled={papeis.length === 0 || iniciando} onClick={() => void comecar()}>
          Entrar no estúdio →
        </button>
        {!plano.premium && plano.ativo && (
          <p className="suave pequeno" style={{ margin: 0, textAlign: "center" }}>
            {Math.max(0, plano.limite - plano.usadasHoje)} de {plano.limite} dublagens grátis hoje ·{" "}
            <Link to="/premium">⭐ Ilimitado no Premium</Link>
          </p>
        )}
        {erroLimite && <p className="alerta">{erroLimite}</p>}
        {semDublagens && (
          <div className="fundo-modal" role="dialog" aria-modal="true" aria-labelledby="titulo-limite" onClick={(e) => e.target === e.currentTarget && setSemDublagens(false)}>
            <div className="cartao pilha modal" style={{ textAlign: "center" }}>
              <div style={{ fontSize: 44 }} aria-hidden>
                🎙️
              </div>
              <h2 id="titulo-limite" style={{ margin: 0 }}>
                Suas 3 dublagens grátis de hoje acabaram
              </h2>
              <p className="suave" style={{ margin: 0 }}>
                Amanhã você ganha mais 3. Ou assine o Premium e duble sem limite, com vídeos sem marca d'água.
              </p>
              <Link to="/premium" className="botao botao-primario botao-grande">
                ⭐ Seja Premium · {PRECO}/mês
              </Link>
              <button className="botao" onClick={() => setSemDublagens(false)}>
                Agora não
              </button>
            </div>
          </div>
        )}
        <span className="suave pequeno">
          {papeis.length ? `${minhasFalas} ${minhasFalas === 1 ? "fala" : "falas"} para gravar. ` : ""}Nada é gravado até você apertar Gravar no estúdio.
        </span>
      </div>

      {(dubs.dado ?? []).length > 0 && (
        <section className="cartao pilha">
          <h3 style={{ margin: 0 }}>Seus dubs desta cena</h3>
          {dubs.dado!.map((d) => {
            const minhas = c.falas.filter((f) => d.papeis.includes(f.personagemId));
            const feitas = minhas.filter((f) => d.tomadas[f.id]).length;
            return (
              <div key={d.id} className="linha entre">
                <span className="linha" style={{ gap: 8 }}>
                  <span className="linha" style={{ gap: 0 }}>
                    {c.personagens
                      .filter((p) => d.papeis.includes(p.id))
                      .map((p) => (
                        <span key={p.id} style={{ marginRight: -8 }}>
                          <Avatar personagem={p} tamanho={30} />
                        </span>
                      ))}
                  </span>
                  <span style={{ marginLeft: 10 }}>
                    <span className="suave pequeno">
                      {feitas}/{minhas.length} falas · {dataCurta(d.atualizadoEm)}
                    </span>
                  </span>
                </span>
                <span className="linha">
                  <Link className="botao botao-pequeno" to={`/estudio/${d.id}`}>
                    Estúdio
                  </Link>
                  <Link className="botao botao-pequeno botao-verde" to={`/dub/${d.id}`}>
                    ▶ Assistir
                  </Link>
                </span>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
