import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import PedirApelido from "../componentes/PedirApelido";
import { meuApelido, publicar } from "../galeria";
import LegendaKaraoke from "../componentes/LegendaKaraoke";
import LinhaDoTempo from "../componentes/LinhaDoTempo";
import { useConfig } from "../config";
import { db } from "../db";
import { buscarCena, useCarregar, useFormatoDoVideo, useMidiasDaCena, useTempoDoVideo } from "../ganchos";
import { decodificar, Mixer } from "../audio/mixer";
import { irPara } from "../audio/sincronia";
import type { Cena, Dub } from "../tipos";
import { formatarTempo, gerarCapa, nomeArquivo, salvarVideoNaGaleria } from "../util";

export default function Sessao() {
  const { dubId = "" } = useParams();
  const dados = useCarregar(async () => {
    const dub = await db.obterDub(dubId);
    if (!dub) throw new Error("Dub não encontrado.");
    const cena = await buscarCena(dub.cenaId);
    if (!cena) throw new Error("A cena deste dub não existe mais.");
    return { dub, cena };
  }, [dubId]);
  if (dados.carregando) return <p className="suave">Carregando…</p>;
  if (dados.erro || !dados.dado) return <p className="alerta">{dados.erro}</p>;
  return <SessaoCarregada dub={dados.dado.dub} cena={dados.dado.cena} />;
}

function formatoDeExportacao(): { mime: string; ext: string } | null {
  if (typeof MediaRecorder === "undefined") return null;
  const opcoes = [
    { mime: "video/mp4;codecs=avc1.42E01E,mp4a.40.2", ext: "mp4" },
    { mime: "video/mp4", ext: "mp4" },
    { mime: "video/webm;codecs=vp9,opus", ext: "webm" },
    { mime: "video/webm;codecs=vp8,opus", ext: "webm" },
    { mime: "video/webm", ext: "webm" },
  ];
  return opcoes.find((o) => MediaRecorder.isTypeSupported(o.mime)) ?? null;
}

function SessaoCarregada({ dub, cena }: { dub: Dub; cena: Cena }) {
  const [cfg] = useConfig();
  const { urls, erro: erroMidia } = useMidiasDaCena(cena);
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const mixer = useRef<Mixer | null>(null);
  const [pronto, setPronto] = useState(false);
  const [tocando, setTocando] = useState(false);
  const [exportando, setExportando] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const cancelar = useRef<() => void>(() => {});
  const [acao, setAcao] = useState<"baixar" | "publicar" | null>(null);
  const [salvo, setSalvo] = useState<string | null>(null);
  const [pedirApelido, setPedirApelido] = useState(false);
  const [etapaPublicar, setEtapaPublicar] = useState<string | null>(null);
  const navegar = useNavigate();
  const tempo = useTempoDoVideo(video);
  const formato = useFormatoDoVideo(video);

  const minhas = useMemo(() => cena.falas.filter((f) => dub.papeis.includes(f.personagemId)), [cena, dub.papeis]);
  const faltando = minhas.filter((f) => !dub.tomadas[f.id]).length;

  useEffect(() => {
    if (!video || !urls) return;
    const m = new Mixer(video);
    mixer.current = m;
    m.volumeOriginalNaMinhaFala = cfg.volumeOriginalNaMinhaFala;
    m.definirVolumeVoz(cfg.volumeVoz);
    // Só silencia o original nas falas que você de fato gravou.
    m.definirJanelas(minhas.filter((f) => dub.tomadas[f.id]));
    let vivo = true;
    (async () => {
      if (urls.fundo) {
        try {
          m.definirFundo(await decodificar(m.ctx, await (await fetch(urls.fundo)).blob()));
        } catch {
          /* segue com o original */
        }
      }
      const lista = [];
      for (const [falaId, t] of Object.entries(dub.tomadas)) {
        lista.push({ falaId, inicioMs: t.inicioMs, buffer: await decodificar(m.ctx, t.audio) });
      }
      if (!vivo) return;
      m.definirTomadas(lista);
      setPronto(true);
    })();
    return () => {
      vivo = false;
      m.destruir();
      mixer.current = null;
    };
  }, [video, urls, dub, minhas, cfg.volumeOriginalNaMinhaFala, cfg.volumeVoz]);

  useEffect(() => () => cancelar.current(), []);

  const alternar = async () => {
    if (!video) return;
    await mixer.current?.ctx.resume();
    if (video.paused) {
      if (video.ended) await irPara(video, 0);
      await video.play();
    } else video.pause();
  };

  /** Toca a cena do começo ao fim gravando imagem + mixagem; devolve o vídeo (ou null se cancelado). */
  const gerarVideo = async (larguraMax: number, bitrate: number): Promise<{ blob: Blob; ext: string } | null> => {
    const m = mixer.current;
    const formato = formatoDeExportacao();
    if (!video || !m) return null;
    if (!formato) {
      setErro("Este aparelho não consegue gerar vídeos. Atualize o sistema ou use o Chrome no computador.");
      return null;
    }
    setErro(null);
    await m.ctx.resume();
    video.pause();
    await irPara(video, 0);

    const escala = Math.min(1, larguraMax / (video.videoWidth || 1280));
    const largura = Math.round(((video.videoWidth || 1280) * escala) / 2) * 2;
    const altura = Math.round(((video.videoHeight || 720) * escala) / 2) * 2;
    const tela = document.createElement("canvas");
    tela.width = largura;
    tela.height = altura;
    const g = tela.getContext("2d")!;
    const destino = m.ctx.createMediaStreamDestination();
    m.saida.connect(destino);
    const fluxo = new MediaStream([...tela.captureStream(30).getVideoTracks(), ...destino.stream.getAudioTracks()]);
    const gravador = new MediaRecorder(fluxo, { mimeType: formato.mime, videoBitsPerSecond: bitrate, audioBitsPerSecond: 128_000 });
    const logo = new Image();
    logo.src = "marca/logo-pequeno.webp";
    await logo.decode().catch(() => {});
    const partes: Blob[] = [];
    gravador.ondataavailable = (e) => e.data.size && partes.push(e.data);

    let raf = 0;
    let cancelado = false;
    const desenhar = () => {
      g.drawImage(video, 0, 0, largura, altura);
      const ms = video.currentTime * 1000;
      // Marca d'água: a logo pequena no canto de baixo, à direita (sem legenda por cima da imagem).
      if (logo.complete && logo.naturalWidth) {
        const lw = Math.round(Math.min(largura, altura) * 0.2);
        const lh = Math.round((lw * logo.naturalHeight) / logo.naturalWidth);
        const m = Math.round(Math.min(largura, altura) * 0.03);
        g.globalAlpha = 0.85;
        g.drawImage(logo, largura - lw - m, altura - lh - m, lw, lh);
        g.globalAlpha = 1;
      }
      setExportando(Math.min(1, ms / Math.max(1, cena.duracaoMs)));
      raf = requestAnimationFrame(desenhar);
    };

    const terminar = () => {
      cancelAnimationFrame(raf);
      video.removeEventListener("ended", terminar);
      if (gravador.state !== "inactive") gravador.stop();
    };
    cancelar.current = () => {
      cancelado = true;
      video.pause();
      terminar();
    };
    const pronto = new Promise<{ blob: Blob; ext: string } | null>((resolve) => {
      gravador.onstop = () => {
        m.saida.disconnect(destino);
        fluxo.getTracks().forEach((t) => t.stop());
        setExportando(null);
        cancelar.current = () => {};
        resolve(cancelado ? null : { blob: new Blob(partes, { type: formato.mime.split(";")[0] }), ext: formato.ext });
      };
    });
    video.addEventListener("ended", terminar);
    gravador.start(1000);
    desenhar();
    await video.play();
    return pronto;
  };

  const baixar = async () => {
    setAcao("baixar");
    try {
      const v = await gerarVideo(1280, 5_000_000);
      if (v) {
        const onde = await salvarVideoNaGaleria(v.blob, `${nomeArquivo(dub.nome)}.${v.ext}`);
        setSalvo(onde === "galeria" ? "✅ Vídeo salvo na galeria do celular (álbum Dubla Brasil AI)." : onde === "download" ? "✅ Vídeo baixado." : null);
      }
    } catch (e) {
      setErro(`Não foi possível salvar o vídeo: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setAcao(null);
    }
  };

  const publicarNaGaleria = async (apelidoConfirmado?: string) => {
    setErro(null);
    try {
      const apelido = apelidoConfirmado ?? (await meuApelido());
      if (!apelido) return setPedirApelido(true);
      setAcao("publicar");
      const v = await gerarVideo(720, 1_500_000);
      if (!v) return;
      setEtapaPublicar("Enviando para a galeria…");
      const primeira = minhas.find((f) => dub.tomadas[f.id]) ?? minhas[0];
      const capa = urls ? await gerarCapa(urls.video, primeira ? (primeira.inicioMs + primeira.fimMs) / 2 : 1000, 480) : null;
      const id = await publicar({
        video: v.blob,
        capa,
        cenaId: cena.id,
        cenaTitulo: cena.titulo,
        papeis: cena.personagens.filter((p) => dub.papeis.includes(p.id)).map((p) => p.nome),
        duracaoMs: cena.duracaoMs,
      });
      navegar(`/galeria?p=${id}`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setAcao(null);
      setEtapaPublicar(null);
    }
  };

  const nomes = cena.personagens.filter((p) => dub.papeis.includes(p.id));

  return (
    <div className="pilha" style={{ maxWidth: 960, margin: "0 auto" }}>
      <div className="linha entre">
        <div>
          <span className="etiqueta">🎬 Sessão de estreia</span>
          <h1 style={{ marginTop: 8 }}>{cena.titulo}</h1>
          <span className="suave">
            Você dublou:{" "}
            {nomes.map((p, i) => (
              <span key={p.id} style={{ color: p.cor, fontWeight: 800 }}>
                {p.nome}
                {i < nomes.length - 1 ? " e " : ""}
              </span>
            ))}
          </span>
        </div>
        <Link className="botao" to={`/estudio/${dub.id}`}>
          🎙️ Voltar ao estúdio
        </Link>
      </div>

      {faltando > 0 && (
        <p className="info">
          Faltam {faltando} {faltando === 1 ? "fala" : "falas"} para gravar. Nelas, fica a voz original.
        </p>
      )}
      {erroMidia && <p className="alerta">{erroMidia}</p>}
      {erro && <p className="alerta">{erro}</p>}
      {salvo && <p className="info">{salvo}</p>}

      <div className={`palco ${formato.vertical ? "vertical" : ""}`} style={formato.estilo}>
        {urls && (
          <video
            crossOrigin="anonymous"
            ref={setVideo}
            src={urls.video}
            playsInline
            preload="auto"
            onPlay={() => setTocando(true)}
            onPause={() => setTocando(false)}
            onClick={alternar}
          />
        )}
      </div>
      {cfg.mostrarLegendas && <LegendaKaraoke falas={cena.falas} personagens={cena.personagens} tempoMs={tempo} papeis={dub.papeis} />}

      <LinhaDoTempo
        duracaoMs={cena.duracaoMs}
        tempoMs={tempo}
        falas={cena.falas}
        personagens={cena.personagens}
        papeis={dub.papeis}
        feitas={new Set(Object.keys(dub.tomadas))}
        onBuscar={(ms) => exportando === null && video && void irPara(video, ms)}
      />

      <div className="controles">
        <button className="botao botao-primario botao-grande" onClick={alternar} disabled={!pronto || exportando !== null}>
          {tocando ? "⏸ Pausar" : "▶ Assistir"}
        </button>
        {exportando === null && !etapaPublicar ? (
          <>
            <button className="botao botao-verde botao-grande" onClick={() => void publicarNaGaleria()} disabled={!pronto || !!acao}>
              🌎 Publicar na galeria
            </button>
            <button className="botao botao-grande" onClick={() => void baixar()} disabled={!pronto || !!acao}>
              ⬇ Salvar na galeria
            </button>
          </>
        ) : (
          <>
            <span className="etiqueta">
              {etapaPublicar ?? `${acao === "publicar" ? "Preparando a publicação" : "Gerando o vídeo"}… ${Math.round((exportando ?? 1) * 100)}%`}
            </span>
            {exportando !== null && (
              <button className="botao botao-perigo" onClick={() => cancelar.current()}>
                Cancelar
              </button>
            )}
          </>
        )}
        <span className="tempo">
          {formatarTempo(tempo)} / {formatarTempo(cena.duracaoMs)}
        </span>
      </div>
      {pedirApelido && (
        <PedirApelido
          aoFechar={() => setPedirApelido(false)}
          aoConfirmar={(a) => {
            setPedirApelido(false);
            void publicarNaGaleria(a);
          }}
        />
      )}
      {exportando !== null && (
        <p className="suave pequeno">O vídeo é gerado em tempo real: deixe esta tela aberta até terminar.</p>
      )}
    </div>
  );
}
