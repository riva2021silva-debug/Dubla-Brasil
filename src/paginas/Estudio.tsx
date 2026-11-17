import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Legenda from "../componentes/Legenda";
import LinhaDoTempo from "../componentes/LinhaDoTempo";
import { useConfig } from "../config";
import { db } from "../db";
import { buscarCena, useCarregar, useMidiasDaCena, useTempoDoVideo } from "../ganchos";
import { Microfone } from "../audio/microfone";
import { decodificar, Mixer, type TomadaTocavel } from "../audio/mixer";
import { compensacao, fatiarEmTomadas, FOLGA_FIM_MS, irPara, picoDe } from "../audio/sincronia";
import type { Cena, Dub, Fala } from "../tipos";
import { formatarTempo } from "../util";

type Modo = "parado" | "gravando" | "ouvindo" | "tocando";

export default function Estudio() {
  const { dubId = "" } = useParams();
  const dados = useCarregar(async () => {
    const dub = await db.obterDub(dubId);
    if (!dub) throw new Error("Dub não encontrado.");
    const cena = await buscarCena(dub.cenaId);
    if (!cena) throw new Error("A cena deste dub não existe mais.");
    return { dub, cena };
  }, [dubId]);

  if (dados.carregando) return <p className="suave">Carregando o estúdio…</p>;
  if (dados.erro || !dados.dado)
    return (
      <div className="vazio">
        <p className="alerta">{dados.erro}</p>
        <Link className="botao" to="/meus-dubs">
          Meus dubs
        </Link>
      </div>
    );
  return <EstudioCarregado dubInicial={dados.dado.dub} cena={dados.dado.cena} />;
}

function EstudioCarregado({ dubInicial, cena }: { dubInicial: Dub; cena: Cena }) {
  const [cfg] = useConfig();
  const { urls, erro: erroMidia } = useMidiasDaCena(cena);
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const mixer = useRef<Mixer | null>(null);
  const mic = useRef<Microfone | null>(null);
  const [micPronto, setMicPronto] = useState(false);
  const [nivel, setNivel] = useState(0);
  const [dub, setDub] = useState(dubInicial);
  const [buffers, setBuffers] = useState<Record<string, AudioBuffer>>({});
  const [modo, setModo] = useState<Modo>("parado");
  const [alvo, setAlvo] = useState<{ falas: Fala[]; fimMs: number } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const tempo = useTempoDoVideo(video);

  const minhas = useMemo(
    () => cena.falas.filter((f) => dub.papeis.includes(f.personagemId)).sort((a, b) => a.inicioMs - b.inicioMs),
    [cena, dub.papeis],
  );
  const [selecionada, setSelecionada] = useState<string | null>(
    () => minhas.find((f) => !dubInicial.tomadas[f.id])?.id ?? minhas[0]?.id ?? null,
  );
  const falaSel = minhas.find((f) => f.id === selecionada) ?? null;
  const feitas = useMemo(() => new Set(Object.keys(dub.tomadas)), [dub.tomadas]);
  const nomeDe = (pid: string) => cena.personagens.find((p) => p.id === pid);

  // Mixer: liga o vídeo, o fundo e as tomadas.
  useEffect(() => {
    if (!video || !urls) return;
    const m = new Mixer(video);
    mixer.current = m;
    m.definirJanelas(minhas);
    let vivo = true;
    if (urls.fundo)
      fetch(urls.fundo)
        .then((r) => r.blob())
        .then((b) => decodificar(m.ctx, b))
        .then((buf) => vivo && m.definirFundo(buf))
        .catch(() => vivo && setAviso("Não foi possível carregar a trilha de fundo; o áudio original será usado."));
    return () => {
      vivo = false;
      m.destruir();
      mixer.current = null;
    };
  }, [video, urls, minhas]);

  useEffect(() => {
    if (!mixer.current) return;
    mixer.current.volumeOriginalNaMinhaFala = cfg.volumeOriginalNaMinhaFala;
    mixer.current.definirVolumeVoz(cfg.volumeVoz);
  }, [cfg.volumeOriginalNaMinhaFala, cfg.volumeVoz, video, urls]);

  // Decodifica as tomadas salvas.
  useEffect(() => {
    let vivo = true;
    const m = mixer.current;
    if (!m) return;
    (async () => {
      const novos: Record<string, AudioBuffer> = {};
      for (const [id, t] of Object.entries(dub.tomadas)) novos[id] = buffers[id] ?? (await decodificar(m.ctx, t.audio));
      if (vivo) setBuffers(novos);
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dub.tomadas, video, urls]);

  useEffect(() => {
    const lista: TomadaTocavel[] = Object.entries(buffers).flatMap(([falaId, buffer]) => {
      const t = dub.tomadas[falaId];
      return t ? [{ falaId, buffer, inicioMs: t.inicioMs }] : [];
    });
    mixer.current?.definirTomadas(lista);
  }, [buffers, dub.tomadas]);

  // Medidor do microfone.
  useEffect(() => {
    if (!micPronto) return;
    let raf = 0;
    const loop = () => {
      setNivel(mic.current?.nivel() ?? 0);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [micPronto]);

  useEffect(() => () => mic.current?.fechar(), []);

  const ativarMic = async () => {
    setErro(null);
    try {
      const m = mixer.current;
      if (!m) throw new Error("O vídeo ainda está carregando.");
      await m.ctx.resume();
      mic.current?.fechar();
      mic.current = await Microfone.abrir(m.ctx, cfg);
      setMicPronto(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  };

  const parar = useCallback(() => {
    mic.current?.parar();
    mixer.current?.ignorarTomadas([]);
    video?.pause();
    setAlvo(null);
    setModo("parado");
  }, [video]);

  const gravar = async (falas: Fala[]) => {
    if (!video || !mixer.current || falas.length === 0) return;
    if (!mic.current) {
      await ativarMic();
      if (!mic.current) return;
    }
    setErro(null);
    setAviso(null);
    const m = mixer.current;
    await m.ctx.resume();
    m.ignorarTomadas(falas.map((f) => f.id));
    const inicio = falas[0].inicioMs - cfg.preRollMs;
    const fimMs = Math.max(...falas.map((f) => f.fimMs)) + FOLGA_FIM_MS + 100;
    video.pause();
    await irPara(video, inicio);
    setAlvo({ falas, fimMs });
    setModo("gravando");
    mic.current.iniciar();
    await video.play();
  };

  // Encerra a gravação quando passa do fim da fala.
  useEffect(() => {
    if (!alvo || !video || !mixer.current) return;
    const terminou = modo === "gravando" && (tempo >= alvo.fimMs || video.ended);
    const terminouOuvir = modo === "ouvindo" && (tempo >= alvo.fimMs || video.ended);
    if (terminouOuvir) parar();
    if (!terminou) return;
    const m = mixer.current;
    const g = mic.current?.parar() ?? null;
    const cenaInicio = g ? m.cenaNoTempo(g.inicioCtx) : null;
    video.pause();
    m.ignorarTomadas([]);
    const falas = alvo.falas;
    setAlvo(null);
    setModo("parado");
    if (!g || cenaInicio === null) {
      setErro("Nada foi gravado. Confira o microfone em Configurações.");
      return;
    }
    if (picoDe(g) < 0.01) setAviso("A gravação ficou quase muda. O microfone certo está selecionado?");
    const novas = fatiarEmTomadas(g, cenaInicio, falas, compensacao(m, cfg.latenciaMs));
    const atualizado: Dub = { ...dub, tomadas: { ...dub.tomadas, ...novas }, atualizadoEm: Date.now() };
    setDub(atualizado);
    setBuffers((b) => {
      const c = { ...b };
      for (const id of Object.keys(novas)) delete c[id];
      return c;
    });
    void db.salvarDub(atualizado);
    if (falas.length === 1) {
      const proxima = minhas.find((f) => f.inicioMs > falas[0].inicioMs && !atualizado.tomadas[f.id]);
      if (proxima) setSelecionada(proxima.id);
    }
  }, [tempo, alvo, modo, video, dub, minhas, cfg.latenciaMs, parar]);

  const ouvir = async (f: Fala) => {
    if (!video) return;
    await mixer.current?.ctx.resume();
    video.pause();
    await irPara(video, f.inicioMs - 800);
    setAlvo({ falas: [f], fimMs: f.fimMs + 900 });
    setModo("ouvindo");
    await video.play();
  };

  const tocarTudo = async () => {
    if (!video) return;
    if (!video.paused) return parar();
    await mixer.current?.ctx.resume();
    if (video.ended || video.currentTime * 1000 >= cena.duracaoMs - 100) await irPara(video, 0);
    setModo("tocando");
    await video.play();
  };

  const apagar = async (f: Fala) => {
    const tomadas = { ...dub.tomadas };
    delete tomadas[f.id];
    const atualizado = { ...dub, tomadas, atualizadoEm: Date.now() };
    setDub(atualizado);
    await db.salvarDub(atualizado);
  };

  // Atalhos de teclado.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, select")) return;
      if (modo !== "parado" && modo !== "tocando") {
        if (e.key === "Escape") parar();
        return;
      }
      const i = minhas.findIndex((f) => f.id === selecionada);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const n = minhas[Math.max(0, Math.min(minhas.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))];
        if (n) setSelecionada(n.id);
      } else if ((e.key === "r" || e.key === "R") && falaSel) {
        e.preventDefault();
        void gravar([falaSel]);
      } else if ((e.key === "o" || e.key === "O") && falaSel && dub.tomadas[falaSel.id]) {
        void ouvir(falaSel);
      } else if (e.key === " ") {
        e.preventDefault();
        void tocarTudo();
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  });

  const proximaFala = alvo?.falas.find((f) => f.fimMs > tempo);
  const contagem = modo === "gravando" && proximaFala && tempo < proximaFala.inicioMs ? Math.ceil((proximaFala.inicioMs - tempo) / 1000) : null;
  const falando = modo === "gravando" && alvo?.falas.some((f) => tempo >= f.inicioMs && tempo < f.fimMs + 200);
  const total = minhas.length;
  const qtdFeitas = minhas.filter((f) => dub.tomadas[f.id]).length;
  const ocupado = modo === "gravando" || modo === "ouvindo";

  return (
    <div className="duas-colunas">
      <div className="pilha">
        <div className="linha entre">
          <div>
            <h1 style={{ fontSize: "1.8rem" }}>Estúdio · {cena.titulo}</h1>
            <span className="suave pequeno">
              Você dubla:{" "}
              {dub.papeis.map((pid) => (
                <span key={pid} style={{ color: nomeDe(pid)?.cor, fontWeight: 800, marginRight: 8 }}>
                  {nomeDe(pid)?.nome}
                </span>
              ))}
            </span>
          </div>
          <Link className={`botao ${qtdFeitas === total && total > 0 ? "botao-verde" : ""}`} to={`/dub/${dub.id}`}>
            ▶ Ver resultado ({qtdFeitas}/{total})
          </Link>
        </div>

        {erroMidia && <p className="alerta">{erroMidia}</p>}
        <div className="palco">
          {urls && <video ref={setVideo} src={urls.video} playsInline preload="auto" onEnded={() => modo === "tocando" && setModo("parado")} />}
          {cfg.mostrarLegendas && <Legenda falas={cena.falas} personagens={cena.personagens} tempoMs={tempo} />}
          {modo === "gravando" && (
            <div className="aviso-gravando" style={{ opacity: falando ? 1 : 0.7 }}>
              ● {falando ? "FALE AGORA" : "GRAVANDO"}
            </div>
          )}
          {contagem !== null && contagem <= 3 && <div className="contagem">{contagem}</div>}
        </div>

        <LinhaDoTempo
          duracaoMs={cena.duracaoMs}
          tempoMs={tempo}
          falas={cena.falas}
          personagens={cena.personagens}
          papeis={dub.papeis}
          feitas={feitas}
          selecionada={selecionada}
          onBuscar={(ms) => !ocupado && video && void irPara(video, ms)}
          onSelecionar={(id) => !ocupado && minhas.some((f) => f.id === id) && setSelecionada(id)}
        />

        <div className="controles">
          <button className="botao" onClick={tocarTudo} disabled={ocupado}>
            {modo === "tocando" ? "⏸ Pausar" : "▶ Tocar com as minhas falas"}
          </button>
          {ocupado ? (
            <button className="botao botao-perigo" onClick={parar}>
              ■ Parar (Esc)
            </button>
          ) : (
            <button className="botao botao-gravar" onClick={() => gravar(minhas)} disabled={!video || total === 0}>
              ● Gravar todas seguidas
            </button>
          )}
          <span className="tempo">
            {formatarTempo(tempo)} / {formatarTempo(cena.duracaoMs)}
          </span>
        </div>

        {falaSel && (
          <div className="cartao pilha" style={{ borderColor: ocupado ? "var(--gravando)" : undefined }}>
            <span className="suave pequeno">
              Fala {minhas.indexOf(falaSel) + 1} de {total} · {formatarTempo(falaSel.inicioMs)} → {formatarTempo(falaSel.fimMs)} ·{" "}
              {((falaSel.fimMs - falaSel.inicioMs) / 1000).toFixed(1)} s
            </span>
            <p style={{ fontSize: "1.5rem", fontWeight: 800, margin: 0 }}>“{falaSel.texto || "…"}”</p>
            <div className="linha">
              <button className="botao botao-gravar botao-grande" onClick={() => gravar([falaSel])} disabled={ocupado || !video}>
                ● {dub.tomadas[falaSel.id] ? "Regravar" : "Gravar"} <kbd>R</kbd>
              </button>
              <button className="botao" onClick={() => ouvir(falaSel)} disabled={ocupado || !dub.tomadas[falaSel.id]}>
                🔊 Ouvir <kbd>O</kbd>
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="pilha">
        <section className="cartao pilha">
          <div className="linha entre">
            <h3 style={{ margin: 0 }}>Microfone</h3>
            <Link to="/configuracoes" className="pequeno">
              Configurar
            </Link>
          </div>
          {micPronto ? (
            <>
              <span className="suave pequeno">{mic.current?.nomeDispositivo()}</span>
              <div className="medidor" aria-label="Nível do microfone">
                <div style={{ width: `${Math.min(100, nivel * 140)}%` }} />
              </div>
            </>
          ) : (
            <button className="botao botao-primario" onClick={ativarMic} disabled={!video}>
              🎙️ Ativar microfone
            </button>
          )}
          <span className="suave pequeno">🎧 Use fones de ouvido para o microfone não captar o vídeo.</span>
        </section>

        {erro && <p className="alerta">{erro}</p>}
        {aviso && <p className="info">{aviso}</p>}
        {!cena.fundo && (
          <p className="info pequeno">
            Esta cena não tem trilha de fundo: durante as suas falas o áudio original fica{" "}
            {cfg.volumeOriginalNaMinhaFala > 0 ? "baixinho" : "mudo"}.
          </p>
        )}

        <section className="cartao pilha">
          <div className="linha entre">
            <h3 style={{ margin: 0 }}>Suas falas</h3>
            <span className="etiqueta">
              {qtdFeitas}/{total} gravadas
            </span>
          </div>
          <div className="lista-falas">
            {minhas.map((f, i) => (
              <div
                key={f.id}
                className={`fala ${f.id === selecionada ? "atual" : ""}`}
                onClick={() => !ocupado && setSelecionada(f.id)}
                style={{ cursor: ocupado ? "default" : "pointer" }}
              >
                <span className="ponto" style={{ background: nomeDe(f.personagemId)?.cor }} />
                <div>
                  <div className="texto">
                    {i + 1}. {f.texto || "…"}
                  </div>
                  <div className="meta">
                    {nomeDe(f.personagemId)?.nome} · {formatarTempo(f.inicioMs)}
                  </div>
                </div>
                <div className="linha" style={{ gap: 4 }}>
                  {dub.tomadas[f.id] ? (
                    <>
                      <span title="Gravada">✅</span>
                      <button
                        className="botao botao-pequeno botao-icone"
                        title="Apagar gravação"
                        aria-label="Apagar gravação"
                        disabled={ocupado}
                        onClick={(e) => {
                          e.stopPropagation();
                          void apagar(f);
                        }}
                      >
                        🗑
                      </button>
                    </>
                  ) : (
                    <span className="suave pequeno">pendente</span>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="suave pequeno" style={{ margin: 0 }}>
            Atalhos: <kbd>↑</kbd>
            <kbd>↓</kbd> escolher fala · <kbd>R</kbd> gravar · <kbd>O</kbd> ouvir · <kbd>Espaço</kbd> tocar · <kbd>Esc</kbd> parar
          </p>
        </section>
      </div>
    </div>
  );
}
