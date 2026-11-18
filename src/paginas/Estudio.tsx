import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Avatar from "../componentes/Avatar";
import FormaDeOnda, { type PontoAoVivo } from "../componentes/FormaDeOnda";
import { useConfig } from "../config";
import { db } from "../db";
import { buscarCena, cenaDoDub, useCarregar, useFormatoDoVideo, useMidiasDaCena, useTempoDoVideo } from "../ganchos";
import { Microfone } from "../audio/microfone";
import { Camera } from "../audio/camera";
import { decodificar, Mixer, type TomadaTocavel } from "../audio/mixer";
import { compensacao, fatiarEmTomadas, FOLGA_FIM_MS, irPara, picoDe } from "../audio/sincronia";
import type { Cena, Dub, Fala, TrechoCamera } from "../tipos";
import { formatarTempo, novoId } from "../util";

type Modo = "parado" | "gravando" | "original" | "minha" | "tocando";

export default function Estudio() {
  const { dubId = "" } = useParams();
  const dados = useCarregar(async () => {
    const dub = await db.obterDub(dubId);
    if (!dub) throw new Error("Dub não encontrado.");
    const cena = await buscarCena(dub.cenaId);
    if (!cena) throw new Error("A cena deste dub não existe mais.");
    return { dub, cena: cenaDoDub(cena, dub) };
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

function rotuloNivel(n: number) {
  if (n > 0.95) return { texto: "Muito alto", cor: "var(--gravando)" };
  if (n > 0.08) return { texto: "Bom", cor: "var(--verde)" };
  return { texto: "Baixo", cor: "var(--texto-suave)" };
}

function EstudioCarregado({ dubInicial, cena }: { dubInicial: Dub; cena: Cena }) {
  const [cfg, salvarCfg] = useConfig();
  const { urls, erro: erroMidia } = useMidiasDaCena(cena);
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const mixer = useRef<Mixer | null>(null);
  const palco = useRef<HTMLDivElement>(null);
  const camera = useRef<Camera | null>(null);
  const camInicioCtx = useRef(0);
  const [camStream, setCamStream] = useState<MediaStream | null>(null);
  const mic = useRef<Microfone | null>(null);
  const [micPronto, setMicPronto] = useState(false);
  const [nivel, setNivel] = useState(0);
  const [avisoNivel, setAvisoNivel] = useState<"baixo" | "alto" | null>(null);
  const baixoDesde = useRef<number | null>(null);
  const altoAte = useRef(0);
  const [dub, setDub] = useState(dubInicial);
  const [buffers, setBuffers] = useState<Record<string, AudioBuffer>>({});
  const [original, setOriginal] = useState<AudioBuffer | null>(null);
  const [modo, setModo] = useState<Modo>("parado");
  const [alvo, setAlvo] = useState<{ falas: Fala[]; fimMs: number } | null>(null);
  const [aoVivo, setAoVivo] = useState<PontoAoVivo[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const tempo = useTempoDoVideo(video);
  const formato = useFormatoDoVideo(video);

  const minhas = useMemo(
    () => cena.falas.filter((f) => dub.papeis.includes(f.personagemId)).sort((a, b) => a.inicioMs - b.inicioMs),
    [cena, dub.papeis],
  );
  const [selecionada, setSelecionada] = useState<string | null>(
    () => minhas.find((f) => !dubInicial.tomadas[f.id])?.id ?? minhas[0]?.id ?? null,
  );
  const indice = Math.max(0, minhas.findIndex((f) => f.id === selecionada));
  const falaSel = minhas[indice] ?? null;
  const personagem = (pid: string) => cena.personagens.find((p) => p.id === pid);

  // Mixer: liga o vídeo, o fundo e as tomadas.
  useEffect(() => {
    if (!video || !urls) return;
    const m = new Mixer(video);
    mixer.current = m;
    const todosOsPapeis = cena.personagens.filter((p) => cena.falas.some((f) => f.personagemId === p.id)).every((p) => dub.papeis.includes(p.id));
    m.definirJanelas(minhas, todosOsPapeis);
    let vivo = true;
    if (urls.fundo)
      fetch(urls.fundo)
        .then((r) => r.blob())
        .then((b) => decodificar(m.ctx, b))
        .then((buf) => vivo && m.definirFundo(buf))
        .catch(() => vivo && setAviso("Não foi possível carregar a trilha de fundo; o áudio original será usado."));
    // Áudio original para desenhar a forma de onda (opcional: se falhar, só não aparece).
    fetch(urls.video)
      .then((r) => r.blob())
      .then((b) => decodificar(m.ctx, b))
      .then((buf) => vivo && setOriginal(buf))
      .catch(() => {});
    return () => {
      vivo = false;
      m.destruir();
      mixer.current = null;
    };
  }, [video, urls, minhas]);

  useEffect(() => {
    if (!mixer.current) return;
    mixer.current.volumeOriginalNaMinhaFala = cfg.volumeOriginalNaMinhaFala;
    mixer.current.somAmbiente = cfg.somAmbiente;
    mixer.current.definirVolumeVoz(cfg.volumeVoz);
  }, [cfg.volumeOriginalNaMinhaFala, cfg.somAmbiente, cfg.volumeVoz, video, urls]);

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

  // Medidor do microfone (e a forma de onda ao vivo enquanto grava).
  const tempoRef = useRef(0);
  tempoRef.current = tempo;
  const gravandoRef = useRef(false);
  const falandoRef = useRef(false);
  gravandoRef.current = modo === "gravando";
  useEffect(() => {
    if (!micPronto) return;
    let raf = 0;
    const loop = () => {
      const n = mic.current?.nivel() ?? 0;
      setNivel(n);
      if (gravandoRef.current) {
        setAoVivo((a) => [...a, { ms: tempoRef.current, nivel: n }]);
        // Durante a fala: avisa se a voz está baixa demais (1,2 s seguidos) ou estourando.
        const agora = performance.now();
        if (falandoRef.current && n < 0.04) baixoDesde.current ??= agora;
        else baixoDesde.current = null;
        if (n > 0.95) altoAte.current = agora + 1500;
        setAvisoNivel(altoAte.current > agora ? "alto" : baixoDesde.current !== null && agora - baixoDesde.current > 1200 ? "baixo" : null);
      } else {
        baixoDesde.current = null;
        setAvisoNivel((v) => (v ? null : v));
      }
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

  const ligarCamera = async (ligar: boolean) => {
    setErro(null);
    camera.current?.fechar();
    camera.current = null;
    setCamStream(null);
    salvarCfg({ usarCamera: ligar });
    if (!ligar) return;
    try {
      camera.current = await Camera.abrir();
      setCamStream(camera.current.stream);
    } catch (e) {
      salvarCfg({ usarCamera: false });
      setErro(e instanceof Error ? e.message : String(e));
    }
  };

  // Se a pessoa deixou a câmera ligada da última vez, liga de novo ao abrir o estúdio.
  useEffect(() => {
    if (cfg.usarCamera) void ligarCamera(true);
    return () => camera.current?.fechar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const parar = useCallback(() => {
    if (mixer.current) mixer.current.guia = 0;
    if (camera.current?.gravando()) void camera.current.parar();
    mic.current?.parar();
    mixer.current?.ignorarTomadas([]);
    mixer.current?.definirModoOriginal(false);
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
    setAoVivo([]);
    const m = mixer.current;
    await m.ctx.resume();
    m.definirModoOriginal(false);
    m.ignorarTomadas(falas.map((f) => f.id));
    const inicio = falas[0].inicioMs - cfg.preRollMs;
    const fimMs = Math.max(...falas.map((f) => f.fimMs)) + FOLGA_FIM_MS + 100;
    video.pause();
    await irPara(video, inicio);
    setAlvo({ falas, fimMs });
    setModo("gravando");
    palco.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (mixer.current) mixer.current.guia = cfg.guiaVoz ? 0.3 : 0;
    mic.current.iniciar();
    if (camera.current) {
      camera.current.iniciar();
      camInicioCtx.current = m.ctx.currentTime;
    }
    await video.play();
  };

  // Encerra a gravação ou a audição quando passa do fim da fala.
  useEffect(() => {
    if (!alvo || !video || !mixer.current) return;
    const passou = tempo >= alvo.fimMs || video.ended;
    if (!passou) return;
    if (modo !== "gravando") return parar();
    const m = mixer.current;
    const g = mic.current?.parar() ?? null;
    m.guia = 0;
    const cenaInicio = g ? m.cenaNoTempo(g.inicioCtx) : null;
    // Câmera: guarda em que momento da cena ela começou (antes de pausar, enquanto o relógio da cena vale).
    const camGravando = camera.current?.gravando() ? camera.current : null;
    const cenaCamera = camGravando ? m.cenaNoTempo(camInicioCtx.current) : null;
    const duracaoCamera = camGravando ? (m.ctx.currentTime - camInicioCtx.current) * 1000 : 0;
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
    const novas = fatiarEmTomadas(g, cenaInicio, falas, compensacao(m, cfg.latenciaMs), {
      limpar: cfg.limparVoz,
      alinharCom: cfg.alinharVoz ? original : null,
    });
    const idsGravados = Object.keys(novas);
    // A câmera antiga dessas falas não combina mais com a voz nova: sai.
    const camerasMantidas = (dub.cameras ?? []).filter((t) => !t.falas.some((f) => idsGravados.includes(f)));
    const atualizado: Dub = { ...dub, tomadas: { ...dub.tomadas, ...novas }, cameras: camerasMantidas, atualizadoEm: Date.now() };
    if (camGravando && cenaCamera !== null) {
      const comp = compensacao(m, cfg.latenciaMs);
      void camGravando.parar().then((video) => {
        if (!video) return;
        const trecho: TrechoCamera = { id: novoId(), video, inicioMs: cenaCamera - comp, duracaoMs: duracaoCamera, falas: idsGravados };
        setDub((d) => {
          const n = { ...d, cameras: [...(d.cameras ?? []).filter((t) => !t.falas.some((f) => idsGravados.includes(f))), trecho] };
          void db.salvarDub(n);
          return n;
        });
      });
    }
    setDub(atualizado);
    setBuffers((b) => {
      const c = { ...b };
      for (const id of Object.keys(novas)) delete c[id];
      return c;
    });
    void db.salvarDub(atualizado);
  }, [tempo, alvo, modo, video, dub, cfg.latenciaMs, cfg.limparVoz, cfg.alinharVoz, original, parar]);

  const ouvir = async (f: Fala, comoOriginal: boolean) => {
    if (!video || !mixer.current) return;
    await mixer.current.ctx.resume();
    video.pause();
    mixer.current.definirModoOriginal(comoOriginal);
    await irPara(video, f.inicioMs - 600);
    setAlvo({ falas: [f], fimMs: f.fimMs + 700 });
    setModo(comoOriginal ? "original" : "minha");
    await video.play();
  };

  const tocarTudo = async () => {
    if (!video) return;
    if (!video.paused) return parar();
    await mixer.current?.ctx.resume();
    mixer.current?.definirModoOriginal(false);
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

  const irParaFala = (i: number) => {
    const f = minhas[Math.max(0, Math.min(minhas.length - 1, i))];
    if (!f) return;
    setSelecionada(f.id);
    setAoVivo([]);
    if (video) void irPara(video, Math.max(0, f.inicioMs - 600));
  };

  // Atalhos de teclado.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, select, summary")) return;
      if (modo !== "parado" && modo !== "tocando") {
        if (e.key === "Escape") parar();
        return;
      }
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        irParaFala(indice + 1);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        irParaFala(indice - 1);
      } else if ((e.key === "r" || e.key === "R") && falaSel) {
        e.preventDefault();
        void gravar([falaSel]);
      } else if ((e.key === "o" || e.key === "O") && falaSel) {
        void ouvir(falaSel, true);
      } else if ((e.key === "m" || e.key === "M") && falaSel && dub.tomadas[falaSel.id]) {
        void ouvir(falaSel, false);
      } else if (e.key === " ") {
        e.preventDefault();
        void tocarTudo();
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  });

  const proximaFala = alvo?.falas.find((f) => f.fimMs > tempo);
  const contagem =
    modo === "gravando" && proximaFala && tempo < proximaFala.inicioMs ? Math.ceil((proximaFala.inicioMs - tempo) / 1000) : null;
  const falando = modo === "gravando" && alvo?.falas.some((f) => tempo >= f.inicioMs && tempo < f.fimMs + 200);
  falandoRef.current = !!falando;
  const total = minhas.length;
  const qtdFeitas = minhas.filter((f) => dub.tomadas[f.id]).length;
  const ocupado = modo === "gravando" || modo === "original" || modo === "minha";
  const temTomada = !!(falaSel && dub.tomadas[falaSel.id]);
  const janela = falaSel ? { de: Math.max(0, falaSel.inicioMs - 600), ate: falaSel.fimMs + 700 } : { de: 0, ate: 1 };
  const decorrido = Math.min(Math.max(0, tempo - janela.de), janela.ate - janela.de);
  const nivelInfo = rotuloNivel(nivel);
  const p = falaSel ? personagem(falaSel.personagemId) : undefined;

  return (
    <div className="estudio">
      <div className="estudio-topo">
        <Link to={`/cena/${cena.id}`} className="botao botao-pequeno" aria-label="Voltar para a cena">
          ←
        </Link>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="estudio-titulo">{cena.titulo}</div>
          <div className="suave pequeno">
            Você dubla{" "}
            {dub.papeis.map((pid) => (
              <b key={pid} style={{ color: personagem(pid)?.cor, marginRight: 6 }}>
                {personagem(pid)?.nome}
              </b>
            ))}
          </div>
        </div>
        <button
          className={`botao botao-pequeno botao-legenda ${camStream ? "ligada" : ""}`}
          aria-pressed={!!camStream}
          title={camStream ? "Desligar a câmera" : "Gravar a câmera junto (aparece no cantinho, como numa chamada)"}
          disabled={ocupado}
          onClick={() => void ligarCamera(!camStream)}
        >
          📷
        </button>
        <button
          className={`botao botao-pequeno botao-legenda ${cfg.mostrarLegendas ? "ligada" : ""}`}
          aria-pressed={cfg.mostrarLegendas}
          title={cfg.mostrarLegendas ? "Esconder a legenda" : "Mostrar a legenda"}
          onClick={() => salvarCfg({ mostrarLegendas: !cfg.mostrarLegendas })}
        >
          💬 {cfg.mostrarLegendas ? "Legenda" : "Sem legenda"}
        </button>
        <Link className={`botao botao-pequeno ${qtdFeitas === total && total > 0 ? "botao-verde" : ""}`} to={`/dub/${dub.id}`}>
          ▶ Resultado {qtdFeitas}/{total}
        </Link>
      </div>
      {dub.base && (
        <div className="linha-dueto pequeno">
          <span className="selo-dueto">🎭 Dueto com @{dub.base.apelido}</span> as outras vozes já estão no vídeo
        </div>
      )}

      {erroMidia && <p className="alerta">{erroMidia}</p>}

      <div ref={palco} className={`palco ${formato.vertical ? "vertical" : ""} ${modo === "gravando" ? "palco-gravando" : ""}`} style={formato.estilo}>
        {urls && (
          <video
            crossOrigin="anonymous"
            ref={setVideo}
            src={urls.video}
            playsInline
            preload="auto"
            onEnded={() => modo === "tocando" && setModo("parado")}
          />
        )}
        {micPronto && (
          <div className="medidor-video" aria-label={`Nível do microfone: ${nivelInfo.texto}`}>
            <span className="ponto" style={{ background: modo === "gravando" ? "var(--gravando)" : "var(--texto-suave)" }} />
            <span className="rotulo">{modo === "gravando" ? (falando ? "Fale agora" : "Gravando") : "Microfone"}</span>
            <span className="barrinhas">
              {Array.from({ length: 14 }, (_, i) => (
                <i key={i} className={nivel * 15 > i ? "acesa" : ""} style={{ height: 5 + i * 1.2 }} />
              ))}
            </span>
            <span className="nivel" style={{ color: nivelInfo.cor }}>
              {nivelInfo.texto}
            </span>
          </div>
        )}
        {camStream && (
          <div className={`pip-camera ${modo === "gravando" ? "gravando" : ""} ${dub.base ? "esquerda" : ""}`}>
            <video
              ref={(el) => {
                if (el && el.srcObject !== camStream) el.srcObject = camStream;
              }}
              muted
              autoPlay
              playsInline
            />
            {modo === "gravando" && <span className="pip-selo">● Gravando</span>}
          </div>
        )}
        {contagem !== null && contagem <= 3 && <div className="contagem">{contagem}</div>}
        {modo === "gravando" && <div className="barra-progresso" style={{ width: `${(decorrido / (janela.ate - janela.de)) * 100}%` }} />}
      </div>

      {total > 0 && (
        <div className="pontos-falas" role="tablist" aria-label="Suas falas">
          {minhas.map((f, i) => (
            <button
              key={f.id}
              role="tab"
              aria-selected={i === indice}
              aria-label={`Fala ${i + 1}${dub.tomadas[f.id] ? ", gravada" : ""}`}
              className={`ponto-fala ${i === indice ? "atual" : ""} ${dub.tomadas[f.id] ? "feita" : ""}`}
              disabled={ocupado}
              onClick={() => irParaFala(i)}
            />
          ))}
        </div>
      )}

      {falaSel ? (
        <>
          <div className="cartao-fala">
            <div className="linha entre pequeno">
              <span className="linha" style={{ gap: 8 }}>
                {p && <Avatar personagem={p} tamanho={34} />}
                <strong style={{ color: p?.cor }}>{p?.nome}</strong>
              </span>
              <span className="suave">
                Fala {indice + 1} de {total} · {((falaSel.fimMs - falaSel.inicioMs) / 1000).toFixed(1)} s
              </span>
            </div>
            {cfg.mostrarLegendas && (
              <p
                className="texto-fala texto-karaoke"
                style={{ "--progresso": `${Math.round(Math.min(1, Math.max(0, (tempo - falaSel.inicioMs) / Math.max(1, falaSel.fimMs - falaSel.inicioMs))) * 100)}%` } as React.CSSProperties}
              >
                {falaSel.texto || "…"}
              </p>
            )}
          </div>

          <SinalDeFala
            fala={(modo === "gravando" && alvo ? alvo.falas.find((f) => tempo < f.fimMs + 400) : null) ?? falaSel}
            tempoMs={tempo}
            ativo={modo === "gravando" || modo === "original"}
            gravando={modo === "gravando"}
          />
          {avisoNivel && (
            <div className={`aviso-nivel ${avisoNivel}`} role="status">
              {avisoNivel === "baixo" ? "🔈 Não estou te ouvindo bem: fale mais alto ou chegue o celular mais perto" : "📢 Muito alto: afaste um pouco o celular"}
            </div>
          )}
          <div className={`painel-onda ${modo === "gravando" ? "gravando" : ""}`}>
            <div className="linha entre pequeno">
              <span className="linha" style={{ gap: 12 }}>
                <button
                  className={`botao-guia ${cfg.guiaVoz ? "ligada" : ""}`}
                  aria-pressed={!!cfg.guiaVoz}
                  title="Guia: ouvir a voz original baixinho enquanto grava (use fone de ouvido)"
                  disabled={ocupado}
                  onClick={() => salvarCfg({ guiaVoz: !cfg.guiaVoz })}
                >
                  {cfg.guiaVoz ? "🔈 Guia" : "🔇 Guia"}
                </button>
                <span className="legenda-onda original">Original</span>
                <span className="legenda-onda minha">{modo === "gravando" ? "Gravando" : "Sua voz"}</span>
              </span>
              <span className="tempo">
                <b style={{ color: "var(--amarelo)" }}>{formatarTempo(decorrido, false)}</b> / {formatarTempo(janela.ate - janela.de, false)}
              </span>
            </div>
            <FormaDeOnda
              original={original}
              tomada={temTomada && buffers[falaSel.id] ? { buffer: buffers[falaSel.id], inicioMs: dub.tomadas[falaSel.id].inicioMs } : null}
              aoVivo={modo === "gravando" || !temTomada ? aoVivo : []}
              deMs={janela.de}
              ateMs={janela.ate}
              falaInicioMs={falaSel.inicioMs}
              falaFimMs={falaSel.fimMs}
              tempoMs={tempo}
              onBuscar={(ms) => !ocupado && video && void irPara(video, ms)}
            />
          </div>

          <div className="botoes-redondos">
            <div className="botao-redondo-grupo">
              <button
                className={`botao-redondo ${modo === "original" ? "ativo" : ""}`}
                onClick={() => (modo === "original" ? parar() : ouvir(falaSel, true))}
                disabled={!video || (ocupado && modo !== "original")}
                aria-label="Ouvir a fala original"
              >
                {modo === "original" ? "■" : "▶"}
              </button>
              <span className="rotulo-redondo">Original</span>
            </div>
            <div className="botao-redondo-grupo">
              <button
                className={`botao-redondo botao-gravar-grande ${modo === "gravando" ? "gravando" : ""}`}
                onClick={() => (modo === "gravando" ? parar() : gravar([falaSel]))}
                disabled={!video || (ocupado && modo !== "gravando")}
                aria-label={modo === "gravando" ? "Parar gravação" : temTomada ? "Regravar esta fala" : "Gravar esta fala"}
              >
                <span className={modo === "gravando" ? "quadrado" : "circulo"} />
              </button>
              <span className="rotulo-redondo" style={{ color: modo === "gravando" ? "var(--gravando)" : undefined }}>
                {modo === "gravando" ? "Parar" : temTomada ? "Regravar" : "Gravar"}
              </span>
            </div>
            <div className="botao-redondo-grupo">
              <button
                className={`botao-redondo ${modo === "minha" ? "ativo" : ""} ${temTomada ? "tem-tomada" : ""}`}
                onClick={() => (modo === "minha" ? parar() : ouvir(falaSel, false))}
                disabled={!temTomada || (ocupado && modo !== "minha")}
                aria-label="Ouvir a minha tomada"
              >
                {modo === "minha" ? "■" : "🎧"}
              </button>
              <span className="rotulo-redondo">Minha tomada</span>
              <span className="suave pequeno">{temTomada ? "Gravada ✓" : "Nenhuma ainda"}</span>
            </div>
          </div>

          {temTomada && !ocupado && (
            indice < total - 1 ? (
              <button className="botao botao-verde botao-grande manter-proxima" onClick={() => irParaFala(indice + 1)}>
                ✅ Ficou bom · Próxima fala →
              </button>
            ) : (
              <Link className="botao botao-verde botao-grande manter-proxima" to={`/dub/${dub.id}`}>
                ✅ Ficou bom · Ver o resultado →
              </Link>
            )
          )}
          <div className="nav-falas">
            <button className="botao-texto" onClick={() => irParaFala(indice - 1)} disabled={ocupado || indice === 0}>
              ‹ Anterior
            </button>
            {indice < total - 1 ? (
              <button className={`botao-texto ${temTomada ? "destaque-nav" : ""}`} onClick={() => irParaFala(indice + 1)} disabled={ocupado}>
                {temTomada ? "Próxima" : "Pular"} ›
              </button>
            ) : (
              <Link className="botao-texto destaque-nav" to={`/dub/${dub.id}`}>
                Ver resultado ›
              </Link>
            )}
          </div>
        </>
      ) : (
        <p className="alerta">Este personagem não tem falas nesta cena.</p>
      )}

      {erro && <p className="alerta">{erro}</p>}
      {aviso && <p className="info">{aviso}</p>}
      {!micPronto && (
        <p className="info pequeno">
          🎧 Use fones de ouvido. Ao tocar em Gravar, o app vai pedir permissão para usar o microfone.
        </p>
      )}

      <details className="cartao mais-opcoes">
        <summary>Mais opções</summary>
        <div className="pilha" style={{ marginTop: 12 }}>
          <div className="linha">
            <button className="botao" onClick={tocarTudo} disabled={ocupado}>
              {modo === "tocando" ? "⏸ Pausar" : "▶ Tocar a cena com as minhas falas"}
            </button>
            <button className="botao botao-gravar" onClick={() => gravar(minhas)} disabled={!video || total === 0 || ocupado}>
              ● Gravar todas seguidas
            </button>
          </div>
          {!cena.fundo && (
            <p className="suave pequeno" style={{ margin: 0 }}>
              {cfg.somAmbiente
                ? "🎵 Som ambiente ligado: nas suas falas a voz original sai e a música e os efeitos do vídeo continuam."
                : `Esta cena não tem trilha de fundo: durante as suas falas o áudio original fica ${cfg.volumeOriginalNaMinhaFala > 0 ? "baixinho" : "mudo"}.`}
            </p>
          )}
          <div className="lista-falas">
            {minhas.map((f, i) => (
              <div key={f.id} className={`fala ${i === indice ? "atual" : ""}`} onClick={() => !ocupado && irParaFala(i)} style={{ cursor: "pointer" }}>
                <span className="ponto" style={{ background: personagem(f.personagemId)?.cor }} />
                <div style={{ minWidth: 0 }}>
                  <div className="texto">
                    {i + 1}. {f.texto || "…"}
                  </div>
                  <div className="meta">{formatarTempo(f.inicioMs)}</div>
                </div>
                {dub.tomadas[f.id] ? (
                  <button
                    className="botao botao-pequeno botao-icone"
                    title="Apagar gravação"
                    aria-label={`Apagar gravação da fala ${i + 1}`}
                    disabled={ocupado}
                    onClick={(e) => {
                      e.stopPropagation();
                      void apagar(f);
                    }}
                  >
                    🗑
                  </button>
                ) : (
                  <span className="suave pequeno">pendente</span>
                )}
              </div>
            ))}
          </div>
          <div className="linha entre">
            <span className="suave pequeno">
              Teclado: <kbd>R</kbd> gravar · <kbd>O</kbd> original · <kbd>M</kbd> minha tomada · <kbd>←</kbd>
              <kbd>→</kbd> falas · <kbd>Esc</kbd> parar
            </span>
            <Link to="/configuracoes" className="pequeno">
              Microfone e sincronia
            </Link>
          </div>
        </div>
      </details>
    </div>
  );
}

/** Faixa que diz, na hora, quando começar e quando parar de falar. */
function SinalDeFala({ fala, tempoMs, ativo, gravando }: { fala: Fala; tempoMs: number; ativo: boolean; gravando: boolean }) {
  const dur = Math.max(1, fala.fimMs - fala.inicioMs);
  if (!ativo)
    return (
      <div className="sinal-fala parado" aria-live="polite">
        <span>
          <b className="cor-fale">▶ Comece</b> no traço verde e <b className="cor-pare">pare ■</b> no vermelho
        </span>
        <span className="sinal-tempo">{(dur / 1000).toFixed(1).replace(".", ",")} s de fala</span>
      </div>
    );
  if (tempoMs < fala.inicioMs) {
    const falta = (fala.inicioMs - tempoMs) / 1000;
    return (
      <div className="sinal-fala prepare" aria-live="polite">
        <span>⏳ {gravando ? "Prepare-se…" : "Escute…"}</span>
        <span className="sinal-tempo">{gravando ? "fale" : "a fala começa"} em {falta.toFixed(1).replace(".", ",")} s</span>
        <span className="sinal-barra" style={{ width: `${Math.max(0, 100 - (falta / 2) * 100)}%` }} />
      </div>
    );
  }
  if (tempoMs < fala.fimMs) {
    const resta = (fala.fimMs - tempoMs) / 1000;
    return (
      <div className="sinal-fala fale" aria-live="polite">
        <span>🎙️ {gravando ? "FALE AGORA" : "Fala do personagem"}</span>
        <span className="sinal-tempo">faltam {resta.toFixed(1).replace(".", ",")} s</span>
        <span className="sinal-barra" style={{ width: `${((tempoMs - fala.inicioMs) / dur) * 100}%` }} />
      </div>
    );
  }
  return (
    <div className="sinal-fala pare" aria-live="polite">
      <span>✋ {gravando ? "PARE de falar" : "Fim da fala"}</span>
    </div>
  );
}
