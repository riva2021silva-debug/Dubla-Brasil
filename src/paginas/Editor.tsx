import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import LinhaDoTempo from "../componentes/LinhaDoTempo";
import Legenda from "../componentes/Legenda";
import { db, urlDaMidia } from "../db";
import { buscarCena, useTempoDoVideo } from "../ganchos";
import { irPara } from "../audio/sincronia";
import type { Cena, Fala, Personagem } from "../tipos";
import { estaPublicada } from "../tipos";
import { corLivre, duracaoDoArquivo, formatarTempo, gerarCapa, IDIOMAS, lerSrt, novoId } from "../util";

interface Arquivo {
  url: string;
  /** Arquivo novo escolhido nesta edição (ainda não salvo). */
  novo?: File;
}

function rascunhoVazio(): Cena {
  const agora = Date.now();
  return {
    id: novoId(),
    titulo: "",
    descricao: "",
    idioma: IDIOMAS[0],
    duracaoMs: 0,
    video: { tipo: "blob", chave: "" },
    fundo: null,
    personagens: [
      { id: novoId(), nome: "Personagem 1", cor: corLivre([]) },
      { id: novoId(), nome: "Personagem 2", cor: corLivre([corLivre([])]) },
    ],
    falas: [],
    criadaEm: agora,
    atualizadaEm: agora,
    publicada: true,
    capa: null,
  };
}

export default function Editor() {
  const { id } = useParams();
  const navegar = useNavigate();
  const [cena, setCena] = useState<Cena | null>(id ? null : rascunhoVazio);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [video, setVideo] = useState<Arquivo | null>(null);
  const [fundo, setFundo] = useState<Arquivo | null>(null);
  const [el, setEl] = useState<HTMLVideoElement | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [previa, setPrevia] = useState<number | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [problemas, setProblemas] = useState<string[]>([]);
  const [alterado, setAlterado] = useState(false);
  const entradaVideo = useRef<HTMLInputElement>(null);
  const entradaFundo = useRef<HTMLInputElement>(null);
  const entradaSrt = useRef<HTMLInputElement>(null);
  const tempo = useTempoDoVideo(el);

  // Carrega uma cena existente.
  useEffect(() => {
    if (!id) return;
    let vivo = true;
    (async () => {
      const c = await buscarCena(id);
      if (!c) throw new Error("Cena não encontrada.");
      const v = await urlDaMidia(c.video);
      const f = c.fundo ? await urlDaMidia(c.fundo) : null;
      if (!vivo) return;
      setCena(c);
      setVideo({ url: v });
      setFundo(f ? { url: f } : null);
    })().catch((e) => vivo && setErroCarga(e instanceof Error ? e.message : String(e)));
    return () => {
      vivo = false;
    };
  }, [id]);

  // Aviso ao sair com alterações não salvas.
  useEffect(() => {
    if (!alterado) return;
    const f = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", f);
    return () => window.removeEventListener("beforeunload", f);
  }, [alterado]);

  // Para a prévia de uma fala no fim dela.
  useEffect(() => {
    if (previa !== null && el && tempo >= previa) {
      el.pause();
      setPrevia(null);
    }
  }, [tempo, previa, el]);

  const atualizar = (fn: (c: Cena) => Cena) => {
    setCena((c) => (c ? fn(c) : c));
    setAlterado(true);
    setProblemas([]);
  };
  const atualizarFala = (fid: string, p: Partial<Fala>) =>
    atualizar((c) => ({ ...c, falas: c.falas.map((f) => (f.id === fid ? { ...f, ...p } : f)) }));
  const atualizarPersonagem = (pid: string, p: Partial<Personagem>) =>
    atualizar((c) => ({ ...c, personagens: c.personagens.map((x) => (x.id === pid ? { ...x, ...p } : x)) }));

  const falasOrdenadas = useMemo(() => [...(cena?.falas ?? [])].sort((a, b) => a.inicioMs - b.inicioMs), [cena?.falas]);
  const falaSel = cena?.falas.find((f) => f.id === sel) ?? null;

  // Atalhos: I/O marcam início e fim, Espaço toca.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, select") || !el) return;
      const ms = Math.round(el.currentTime * 1000);
      if (e.key === " ") {
        e.preventDefault();
        if (el.paused) void el.play();
        else el.pause();
      } else if ((e.key === "i" || e.key === "I") && falaSel) atualizarFala(falaSel.id, { inicioMs: ms });
      else if ((e.key === "o" || e.key === "O") && falaSel) atualizarFala(falaSel.id, { fimMs: ms });
      else if (e.key === "n" || e.key === "N") novaFala();
      else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const passo = (e.shiftKey ? 100 : 1000) * (e.key === "ArrowLeft" ? -1 : 1);
        el.currentTime = Math.max(0, el.currentTime + passo / 1000);
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  });

  if (erroCarga)
    return (
      <div className="vazio">
        <p className="alerta">{erroCarga}</p>
        <Link className="botao" to="/admin/cena/nova">
          Criar cena nova
        </Link>
      </div>
    );
  if (!cena) return <p className="suave">Carregando…</p>;

  const escolherVideo = async (f: File) => {
    const url = URL.createObjectURL(f);
    try {
      const duracaoMs = await duracaoDoArquivo(url, "video");
      setVideo({ url, novo: f });
      atualizar((c) => ({ ...c, duracaoMs, titulo: c.titulo || f.name.replace(/\.[^.]+$/, "") }));
    } catch (e) {
      URL.revokeObjectURL(url);
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  const escolherFundo = async (f: File) => {
    const url = URL.createObjectURL(f);
    try {
      await duracaoDoArquivo(url, "audio");
      setFundo({ url, novo: f });
      setAlterado(true);
    } catch {
      URL.revokeObjectURL(url);
      alert("Não foi possível ler esta trilha. Use MP3, M4A, WAV ou OGG.");
    }
  };

  function novaFala() {
    if (!cena) return;
    const ms = Math.round((el?.currentTime ?? 0) * 1000);
    const f: Fala = {
      id: novoId(),
      personagemId: falaSel?.personagemId ?? cena.personagens[0]?.id ?? "",
      texto: "",
      inicioMs: ms,
      fimMs: Math.min(ms + 2000, cena.duracaoMs || ms + 2000),
    };
    atualizar((c) => ({ ...c, falas: [...c.falas, f] }));
    setSel(f.id);
  }

  const importarSrt = async (arq: File) => {
    const lidas = lerSrt(await arq.text());
    if (lidas.length === 0) return alert("Nenhuma legenda encontrada neste arquivo .srt.");
    const pid = cena.personagens[0]?.id ?? "";
    atualizar((c) => ({ ...c, falas: [...c.falas, ...lidas.map((l) => ({ ...l, id: novoId(), personagemId: pid }))] }));
  };

  const previaFala = async (f: Fala) => {
    if (!el) return;
    await irPara(el, f.inicioMs);
    setPrevia(f.fimMs);
    await el.play();
  };

  const validar = (): string[] => {
    const p: string[] = [];
    if (!cena.titulo.trim()) p.push("Dê um título para a cena.");
    if (!video) p.push("Escolha o vídeo da cena.");
    if (cena.personagens.length === 0) p.push("Adicione pelo menos um personagem.");
    if (cena.personagens.some((x) => !x.nome.trim())) p.push("Todos os personagens precisam de nome.");
    if (cena.falas.length === 0) p.push("Adicione pelo menos uma fala.");
    cena.falas.forEach((f) => {
      const n = falasOrdenadas.indexOf(f) + 1;
      if (f.fimMs <= f.inicioMs) p.push(`A fala ${n} termina antes de começar.`);
      if (!cena.personagens.some((x) => x.id === f.personagemId)) p.push(`A fala ${n} está sem personagem.`);
    });
    return p;
  };

  const salvar = async () => {
    const p = validar();
    setProblemas(p);
    if (p.length) return;
    setSalvando(true);
    try {
      let c: Cena = { ...cena, falas: falasOrdenadas, atualizadaEm: Date.now() };
      if (video?.novo) {
        const chave = `${c.id}:video`;
        await db.salvarMidia(chave, video.novo);
        c = { ...c, video: { tipo: "blob", chave } };
      }
      const chaveFundo = `${c.id}:fundo`;
      if (fundo?.novo) {
        await db.salvarMidia(chaveFundo, fundo.novo);
        c = { ...c, fundo: { tipo: "blob", chave: chaveFundo } };
      } else if (!fundo && c.fundo) {
        await db.excluirMidia(chaveFundo);
        c = { ...c, fundo: null };
      }
      // Capa: um quadro do vídeo no meio da primeira fala (se o vídeo mudou ou ainda não há capa).
      if (video && (video.novo || !c.capa)) {
        const primeira = falasOrdenadas[0];
        const ms = primeira ? (primeira.inicioMs + primeira.fimMs) / 2 : Math.min(2000, c.duracaoMs / 2);
        const foto = await gerarCapa(video.url, ms);
        if (foto) {
          const chaveCapa = `${c.id}:capa`;
          await db.salvarMidia(chaveCapa, foto);
          c = { ...c, capa: { tipo: "blob", chave: chaveCapa } };
        }
      }
      await db.salvarCena(c);
      setAlterado(false);
      navegar("/admin");
    } catch (e) {
      setProblemas([
        e instanceof Error && e.name === "QuotaExceededError"
          ? "Sem espaço no navegador para salvar este vídeo. Use um arquivo menor."
          : `Não foi possível salvar: ${e instanceof Error ? e.message : String(e)}`,
      ]);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="pilha">
      <div className="linha entre">
        <div>
          <Link to="/admin" className="pequeno">
            ← Administração
          </Link>
          <h1>{id ? "Editar cena" : "Adicionar vídeo"}</h1>
          <p className="suave" style={{ margin: 0 }}>
            Envie o vídeo, cadastre os personagens e marque quando cada fala começa e termina.
          </p>
        </div>
        <div className="linha">
          <label className="linha interruptor">
            <input id="publicada" type="checkbox" checked={estaPublicada(cena)} onChange={(e) => atualizar((c) => ({ ...c, publicada: e.target.checked }))} />
            <span>Publicada no app</span>
          </label>
          <button className="botao botao-primario botao-grande" onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando…" : "💾 Salvar cena"}
          </button>
        </div>
      </div>

      {problemas.length > 0 && (
        <div className="alerta">
          {problemas.map((p) => (
            <div key={p}>• {p}</div>
          ))}
        </div>
      )}

      <div className="duas-colunas">
        <div className="pilha">
          {video ? (
            <>
              <div className="palco">
                <video ref={setEl} src={video.url} controls playsInline preload="auto" />
                <Legenda falas={cena.falas} personagens={cena.personagens} tempoMs={tempo} />
              </div>
              <LinhaDoTempo
                duracaoMs={cena.duracaoMs}
                tempoMs={tempo}
                falas={cena.falas}
                personagens={cena.personagens}
                selecionada={sel}
                onBuscar={(ms) => el && (el.currentTime = ms / 1000)}
                onSelecionar={setSel}
              />
              <div className="controles">
                <button className="botao" onClick={() => (el?.paused ? el.play() : el?.pause())}>
                  ⏯ Tocar/pausar
                </button>
                <button className="botao botao-primario" onClick={novaFala}>
                  + Fala aqui <kbd>N</kbd>
                </button>
                <button className="botao" onClick={() => entradaSrt.current?.click()}>
                  📄 Importar legendas (.srt)
                </button>
                <span className="tempo">
                  {formatarTempo(tempo)} / {formatarTempo(cena.duracaoMs)}
                </span>
              </div>
              <p className="suave pequeno" style={{ margin: 0 }}>
                Atalhos: <kbd>Espaço</kbd> tocar · <kbd>I</kbd> marcar início · <kbd>O</kbd> marcar fim da fala selecionada ·{" "}
                <kbd>←</kbd>
                <kbd>→</kbd> 1 s (com <kbd>Shift</kbd>, 0,1 s)
              </p>
            </>
          ) : (
            <button className="cartao vazio" style={{ cursor: "pointer", borderStyle: "dashed" }} onClick={() => entradaVideo.current?.click()}>
              <div style={{ fontSize: "2.5rem" }}>🎬</div>
              <strong>Escolher o vídeo da cena</strong>
              <p className="pequeno">MP4 ou WebM, de preferência curto (até 1 minuto).</p>
            </button>
          )}

          <section className="cartao pilha">
            <div className="linha entre">
              <h3 style={{ margin: 0 }}>Falas ({cena.falas.length})</h3>
              {falaSel && (
                <span className="suave pequeno">
                  Selecionada: fala {falasOrdenadas.indexOf(falaSel) + 1}
                </span>
              )}
            </div>
            {cena.falas.length === 0 && (
              <p className="suave pequeno" style={{ margin: 0 }}>
                Toque o vídeo até o começo de uma fala e clique em “+ Fala aqui”, ou importe um arquivo de legendas .srt.
              </p>
            )}
            <div className="tabela-falas">
              {falasOrdenadas.map((f, i) => (
                <div key={f.id} className={`linha-fala ${f.id === sel ? "selecionada" : ""}`} onClick={() => setSel(f.id)}>
                  <strong className="suave">{i + 1}</strong>
                  <select
                    className="entrada"
                    value={f.personagemId}
                    onChange={(e) => atualizarFala(f.id, { personagemId: e.target.value })}
                    aria-label="Personagem"
                    style={{ borderColor: cena.personagens.find((p) => p.id === f.personagemId)?.cor }}
                  >
                    {!cena.personagens.some((p) => p.id === f.personagemId) && <option value="">—</option>}
                    {cena.personagens.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nome}
                      </option>
                    ))}
                  </select>
                  <input
                    className="entrada"
                    value={f.texto}
                    placeholder="O que o personagem diz…"
                    onChange={(e) => atualizarFala(f.id, { texto: e.target.value })}
                    aria-label="Texto da fala"
                  />
                  <div className="linha tempos" style={{ gap: 4 }}>
                    <AjusteTempo rotulo="início" ms={f.inicioMs} onMarcar={() => atualizarFala(f.id, { inicioMs: Math.round(tempo) })} onMudar={(ms) => atualizarFala(f.id, { inicioMs: ms })} />
                    <AjusteTempo rotulo="fim" ms={f.fimMs} onMarcar={() => atualizarFala(f.id, { fimMs: Math.round(tempo) })} onMudar={(ms) => atualizarFala(f.id, { fimMs: ms })} />
                    <button className="botao botao-pequeno botao-icone" title="Ouvir esta fala" aria-label="Ouvir esta fala" onClick={(e) => { e.stopPropagation(); void previaFala(f); }}>
                      ▶
                    </button>
                    <button
                      className="botao botao-pequeno botao-icone botao-perigo"
                      title="Excluir fala"
                      aria-label="Excluir fala"
                      onClick={(e) => {
                        e.stopPropagation();
                        atualizar((c) => ({ ...c, falas: c.falas.filter((x) => x.id !== f.id) }));
                      }}
                    >
                      🗑
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="pilha">
          <section className="cartao pilha">
            <h3 style={{ margin: 0 }}>Detalhes</h3>
            <label className="campo">
              Título
              <input className="entrada" value={cena.titulo} onChange={(e) => atualizar((c) => ({ ...c, titulo: e.target.value }))} placeholder="Ex.: A briga do pão de queijo" />
            </label>
            <label className="campo">
              Descrição
              <textarea className="entrada" value={cena.descricao} onChange={(e) => atualizar((c) => ({ ...c, descricao: e.target.value }))} placeholder="Do que se trata a cena?" />
            </label>
            <label className="campo">
              Idioma das falas
              <select className="entrada" value={cena.idioma} onChange={(e) => atualizar((c) => ({ ...c, idioma: e.target.value }))}>
                {IDIOMAS.map((i) => (
                  <option key={i}>{i}</option>
                ))}
              </select>
            </label>
          </section>

          <section className="cartao pilha">
            <h3 style={{ margin: 0 }}>Arquivos</h3>
            <div className="linha entre">
              <span>
                <strong>Vídeo</strong>
                <br />
                <span className="suave pequeno">{video ? `${formatarTempo(cena.duracaoMs, false)} de duração` : "obrigatório"}</span>
              </span>
              <button className="botao botao-pequeno" onClick={() => entradaVideo.current?.click()}>
                {video ? "Trocar" : "Escolher"}
              </button>
            </div>
            <div className="linha entre">
              <span>
                <strong>Trilha de fundo</strong>
                <br />
                <span className="suave pequeno">{fundo ? "carregada" : "opcional: música e efeitos sem vozes"}</span>
              </span>
              <span className="linha">
                {fundo && (
                  <button className="botao botao-pequeno botao-perigo" onClick={() => { setFundo(null); setAlterado(true); }}>
                    Remover
                  </button>
                )}
                <button className="botao botao-pequeno" onClick={() => entradaFundo.current?.click()}>
                  {fundo ? "Trocar" : "Escolher"}
                </button>
              </span>
            </div>
            {fundo && <audio src={fundo.url} controls style={{ width: "100%" }} />}
            <p className="suave pequeno" style={{ margin: 0 }}>
              Com a trilha de fundo, a música continua tocando enquanto a pessoa dubla. Ela precisa começar junto com o
              vídeo. Ferramentas de separação de voz (como o Demucs) geram essa trilha a partir do áudio original.
            </p>
          </section>

          <section className="cartao pilha">
            <div className="linha entre">
              <h3 style={{ margin: 0 }}>Personagens</h3>
              <button
                className="botao botao-pequeno"
                onClick={() =>
                  atualizar((c) => ({
                    ...c,
                    personagens: [...c.personagens, { id: novoId(), nome: `Personagem ${c.personagens.length + 1}`, cor: corLivre(c.personagens.map((p) => p.cor)) }],
                  }))
                }
              >
                + Adicionar
              </button>
            </div>
            {cena.personagens.map((p) => {
              const usos = cena.falas.filter((f) => f.personagemId === p.id).length;
              return (
                <div key={p.id} className="linha" style={{ flexWrap: "nowrap" }}>
                  <input type="color" value={p.cor} onChange={(e) => atualizarPersonagem(p.id, { cor: e.target.value })} aria-label={`Cor de ${p.nome}`} style={{ width: 38, height: 38, border: "none", background: "none", padding: 0 }} />
                  <input className="entrada" value={p.nome} onChange={(e) => atualizarPersonagem(p.id, { nome: e.target.value })} aria-label="Nome do personagem" />
                  <span className="suave pequeno" style={{ whiteSpace: "nowrap" }}>
                    {usos} {usos === 1 ? "fala" : "falas"}
                  </span>
                  <button
                    className="botao botao-pequeno botao-icone botao-perigo"
                    aria-label={`Excluir ${p.nome}`}
                    title={usos ? "Este personagem tem falas: mude o personagem delas antes de excluir" : "Excluir personagem"}
                    disabled={usos > 0}
                    onClick={() => atualizar((c) => ({ ...c, personagens: c.personagens.filter((x) => x.id !== p.id) }))}
                  >
                    🗑
                  </button>
                </div>
              );
            })}
          </section>
          <p className="suave pequeno">
            Use apenas vídeos e áudios que você tem direito de usar. Desmarque “Publicada no app” para guardar a cena
            como rascunho, sem aparecer para quem usa o app.
          </p>
        </div>
      </div>

      <input ref={entradaVideo} type="file" accept="video/*" className="oculto" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void escolherVideo(f); }} />
      <input ref={entradaFundo} type="file" accept="audio/*,video/*" className="oculto" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void escolherFundo(f); }} />
      <input ref={entradaSrt} type="file" accept=".srt,text/plain" className="oculto" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void importarSrt(f); }} />
    </div>
  );
}

function AjusteTempo({ rotulo, ms, onMarcar, onMudar }: { rotulo: string; ms: number; onMarcar: () => void; onMudar: (ms: number) => void }) {
  return (
    <span className="ajuste-tempo" onClick={(e) => e.stopPropagation()}>
      <button className="botao botao-pequeno" style={{ padding: "4px 7px" }} title={`Diminuir ${rotulo} em 0,1 s`} aria-label={`Diminuir ${rotulo}`} onClick={() => onMudar(Math.max(0, ms - 100))}>
        −
      </button>
      <button className="botao botao-pequeno" style={{ padding: "4px 7px" }} title={`Marcar ${rotulo} no tempo atual`} onClick={onMarcar}>
        {formatarTempo(ms)}
      </button>
      <button className="botao botao-pequeno" style={{ padding: "4px 7px" }} title={`Aumentar ${rotulo} em 0,1 s`} aria-label={`Aumentar ${rotulo}`} onClick={() => onMudar(ms + 100)}>
        +
      </button>
    </span>
  );
}
