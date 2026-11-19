import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import PedirApelido from "../componentes/PedirApelido";
import { LIMITE_BYTES, meuApelido, publicar } from "../galeria";
import LegendaKaraoke from "../componentes/LegendaKaraoke";
import LinhaDoTempo from "../componentes/LinhaDoTempo";
import { useConfig } from "../config";
import { db } from "../db";
import { buscarCena, cenaDoDub, useCarregar, useFormatoDoVideo, useMidiasDaCena, useTempoDoVideo } from "../ganchos";
import { decodificar, Mixer } from "../audio/mixer";
import { irPara } from "../audio/sincronia";
import { trechoNoTempo } from "../audio/camera";
import { usePlano } from "../plano";
import type { Cena, Dub } from "../tipos";
import { formatarTempo, gerarCapa, nomeArquivo, salvarVideoNaGaleria } from "../util";

export default function Sessao() {
  const { dubId = "" } = useParams();
  const dados = useCarregar(async () => {
    const dub = await db.obterDub(dubId);
    if (!dub) throw new Error("Dub não encontrado.");
    const cena = await buscarCena(dub.cenaId);
    if (!cena) throw new Error("A cena deste dub não existe mais.");
    return { dub, cena: cenaDoDub(cena, dub) };
  }, [dubId]);
  if (dados.carregando) return <p className="suave">Carregando…</p>;
  if (dados.erro || !dados.dado) return <p className="alerta">{dados.erro}</p>;
  return <SessaoCarregada dub={dados.dado.dub} cena={dados.dado.cena} />;
}

/** Quadrado de cantos arredondados (roundRect não existe em iPhones com iOS antigo). */
function retanguloArredondado(g: CanvasRenderingContext2D, x: number, y: number, lado: number, r: number) {
  g.moveTo(x + r, y);
  g.arcTo(x + lado, y, x + lado, y + lado, r);
  g.arcTo(x + lado, y + lado, x, y + lado, r);
  g.arcTo(x, y + lado, x, y, r);
  g.arcTo(x, y, x + lado, y, r);
  g.closePath();
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
  const [cfg, salvarCfg] = useConfig();
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
  const [aviso, setAviso] = useState<string | null>(null);
  const caixaErro = useRef<HTMLParagraphElement>(null);
  // Erro aparece perto dos botões e a tela rola até ele (antes ficava só no topo e passava despercebido).
  useEffect(() => {
    if (erro) caixaErro.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [erro]);
  const navegar = useNavigate();
  const tempo = useTempoDoVideo(video);
  const formato = useFormatoDoVideo(video);
  const plano = usePlano();
  const pip = useRef<HTMLVideoElement>(null);
  const [pipVisivel, setPipVisivel] = useState(false);
  const cameras = dub.cameras;
  const urlsCamera = useMemo(() => new Map((cameras ?? []).map((t) => [t.id, URL.createObjectURL(t.video)])), [cameras]);
  useEffect(() => () => urlsCamera.forEach((u) => URL.revokeObjectURL(u)), [urlsCamera]);

  // Mantém o vídeo da câmera (cantinho) andando junto com o vídeo principal.
  useEffect(() => {
    if (!video || !cameras?.length) return;
    let raf = 0;
    let atual: string | null = null;
    const passo = () => {
      const p = pip.current;
      if (p) {
        const ms = video.currentTime * 1000;
        const t = trechoNoTempo(cameras, ms);
        if (!t) {
          if (atual) {
            p.pause();
            atual = null;
            setPipVisivel(false);
          }
        } else {
          if (atual !== t.id) {
            atual = t.id;
            p.src = urlsCamera.get(t.id) ?? "";
            setPipVisivel(true);
          }
          const alvo = Math.max(0, (ms - t.inicioMs) / 1000);
          // Pular (seek) trava o vídeo por um instante; só pula se estiver muito fora. Fora isso, acelera ou freia de leve.
          const desvio = p.currentTime - alvo;
          if (p.readyState >= 1 && (Math.abs(desvio) > 0.6 || video.paused) && Math.abs(desvio) > 0.12) p.currentTime = alvo;
          else p.playbackRate = Math.abs(desvio) < 0.04 ? 1 : desvio > 0 ? 0.92 : 1.08;
          if (!video.paused && p.paused) void p.play().catch(() => {});
          if (video.paused && !p.paused) p.pause();
        }
      }
      raf = requestAnimationFrame(passo);
    };
    passo();
    return () => cancelAnimationFrame(raf);
  }, [video, cameras, urlsCamera]);

  const minhas = useMemo(() => cena.falas.filter((f) => dub.papeis.includes(f.personagemId)), [cena, dub.papeis]);
  const faltando = minhas.filter((f) => !dub.tomadas[f.id]).length;

  useEffect(() => {
    if (!video || !urls) return;
    const m = new Mixer(video);
    mixer.current = m;
    m.definirFalasDaCena(cena.falas);
    m.volumeOriginalNaMinhaFala = cfg.volumeOriginalNaMinhaFala;
    m.somAmbiente = cfg.somAmbiente;
    m.definirVolumeVoz(cfg.volumeVoz);
    // Só silencia o original nas falas que você de fato gravou.
    // Se a pessoa dublou todos os personagens e gravou todas as falas, a voz original some na cena inteira.
    const todosOsPapeis = cena.personagens.filter((p) => cena.falas.some((f) => f.personagemId === p.id)).every((p) => dub.papeis.includes(p.id));
    const gravadas = minhas.filter((f) => dub.tomadas[f.id]);
    m.definirJanelas(gravadas, todosOsPapeis && gravadas.length === cena.falas.length);
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
  }, [video, urls, dub, minhas, cfg.volumeOriginalNaMinhaFala, cfg.somAmbiente, cfg.volumeVoz]);

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
  const gerarVideo = async (larguraMax: number, bitrate: number, bitrateAudio = 128_000): Promise<{ blob: Blob; ext: string } | null> => {
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
    // O quadro só é enviado quando desenhamos um novo (sem quadros repetidos nem pulados por excesso de trabalho).
    // (iPhone antigo sem requestFrame: usa 30 quadros por segundo fixos.)
    const comRequestFrame = typeof CanvasCaptureMediaStreamTrack !== "undefined" && "requestFrame" in CanvasCaptureMediaStreamTrack.prototype;
    const porQuadro = comRequestFrame && "requestVideoFrameCallback" in HTMLVideoElement.prototype;
    const trilha = tela.captureStream(porQuadro ? 0 : 30).getVideoTracks()[0] as MediaStreamTrack & { requestFrame?: () => void };
    const fluxo = new MediaStream([trilha, ...destino.stream.getAudioTracks()]);
    const gravador = new MediaRecorder(fluxo, { mimeType: formato.mime, videoBitsPerSecond: bitrate, audioBitsPerSecond: bitrateAudio });
    const comMarca = !plano.premium; // Premium: vídeo sem marca d'água
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
      // Câmera da pessoa num quadradinho no canto de cima, à direita (como numa chamada), espelhada.
      const p = pip.current;
      if (p && trechoNoTempo(cameras, ms) && p.readyState >= 2 && p.videoWidth) {
        const lado = Math.round(Math.min(largura, altura) * (altura > largura ? 0.42 : 0.3));
        const mg = Math.round(Math.min(largura, altura) * 0.035);
        // Dueto: o vídeo base já tem a câmera da outra pessoa à direita; a sua fica à esquerda.
        const x = dub.base ? mg : largura - lado - mg;
        const y = mg;
        const raio = Math.round(lado * 0.12);
        const borda = Math.max(2, Math.round(lado * 0.025));
        const s = Math.min(p.videoWidth, p.videoHeight);
        g.save();
        g.beginPath();
        retanguloArredondado(g, x - borda, y - borda, lado + borda * 2, raio + borda);
        g.fillStyle = "#ffffff";
        g.fill();
        g.beginPath();
        retanguloArredondado(g, x, y, lado, raio);
        g.clip();
        g.translate(x + lado, y);
        g.scale(-1, 1);
        g.drawImage(p, (p.videoWidth - s) / 2, (p.videoHeight - s) / 2, s, s, 0, 0, lado, lado);
        g.restore();
      }
      // Marca d'água: a logo pequena no canto de baixo, à direita (sem legenda por cima da imagem).
      if (comMarca && logo.complete && logo.naturalWidth) {
        const lw = Math.round(Math.min(largura, altura) * 0.2);
        const lh = Math.round((lw * logo.naturalHeight) / logo.naturalWidth);
        const m = Math.round(Math.min(largura, altura) * 0.03);
        g.globalAlpha = 0.85;
        g.drawImage(logo, largura - lw - m, altura - lh - m, lw, lh);
        g.globalAlpha = 1;
      }
      trilha.requestFrame?.();
      const pct = Math.round((ms / Math.max(1, cena.duracaoMs)) * 100);
      if (pct !== ultimoPct) {
        ultimoPct = pct;
        setExportando(Math.min(1, pct / 100));
      }
      agendar();
    };
    let ultimoPct = -1;
    let rvfc = 0;
    const agendar = () => {
      if (porQuadro) rvfc = video.requestVideoFrameCallback(desenhar);
      else raf = requestAnimationFrame(desenhar);
    };

    const terminar = () => {
      cancelAnimationFrame(raf);
      if (porQuadro) video.cancelVideoFrameCallback(rvfc);
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
      const v = await gerarVideo(960, 3_500_000);
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
      // A galeria aceita até 15 MB por vídeo: a qualidade se ajusta ao tamanho da cena para sempre caber.
      let q = qualidadeParaGaleria(cena.duracaoMs, LIMITE_BYTES * 0.8);
      let v = await gerarVideo(q.largura, q.video, q.audio);
      if (!v) return;
      if (v.blob.size > LIMITE_BYTES * 0.97) {
        // O aparelho passou do alvo: gera de novo, mais leve, sem a pessoa precisar fazer nada.
        q = qualidadeParaGaleria(cena.duracaoMs, (LIMITE_BYTES * 0.8 * LIMITE_BYTES * 0.8) / v.blob.size);
        setEtapaPublicar(null);
        setErro(null);
        setAviso("O vídeo ficou um pouco grande para a galeria. Gerando de novo em qualidade menor…");
        v = await gerarVideo(q.largura, q.video, q.audio);
        setAviso(null);
        if (!v) return;
        if (v.blob.size > LIMITE_BYTES) throw new Error("Mesmo em qualidade menor o vídeo passou de 15 MB. Esta cena é longa demais para a galeria; use “Salvar na galeria” para guardar no celular.");
      }
      setEtapaPublicar("Enviando para a galeria…");
      const primeira = minhas.find((f) => dub.tomadas[f.id]) ?? minhas[0];
      const capa = urls ? await gerarCapa(urls.video, primeira ? (primeira.inicioMs + primeira.fimMs) / 2 : 1000, 480) : null;
      const id = await publicar({
        video: v.blob,
        capa,
        cenaId: cena.id,
        cenaTitulo: cena.titulo,
        // Dueto: o vídeo tem as vozes das duas pessoas (quem quiser dublar junto depois só pega quem sobrou).
        papeis: [...new Set([...(dub.base?.papeis ?? []), ...cena.personagens.filter((p) => dub.papeis.includes(p.id)).map((p) => p.nome)])],
        duracaoMs: cena.duracaoMs,
        duetoDe: dub.base?.publicacaoId ?? null,
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
          <span className="linha" style={{ gap: 8 }}>
            <span className="etiqueta">🎬 Sessão de estreia</span>
            <button
              className={`botao botao-pequeno botao-legenda ${cfg.mostrarLegendas ? "ligada" : ""}`}
              aria-pressed={cfg.mostrarLegendas}
              onClick={() => salvarCfg({ mostrarLegendas: !cfg.mostrarLegendas })}
            >
              💬 {cfg.mostrarLegendas ? "Legenda" : "Sem legenda"}
            </button>
          </span>
          <h1 style={{ marginTop: 8 }}>{cena.titulo}</h1>
          <span className="suave">
            Você dublou:{" "}
            {nomes.map((p, i) => (
              <span key={p.id} style={{ color: p.cor, fontWeight: 800 }}>
                {p.nome}
                {i < nomes.length - 1 ? " e " : ""}
              </span>
            ))}
            {dub.base && <span className="selo-dueto" style={{ marginLeft: 8 }}>🎭 Dueto com @{dub.base.apelido}</span>}
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
        {!!cameras?.length && (
          <div className={`pip-camera ${dub.base ? "esquerda" : ""}`} hidden={!pipVisivel}>
            <video ref={pip} muted playsInline preload="auto" />
          </div>
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
      {!plano.premium && (
        <p className="suave pequeno" style={{ margin: 0 }}>
          O vídeo sai com a marca d'água do Dubla Brasil. <Link to="/premium">⭐ Tire a marca com o Premium</Link>
        </p>
      )}
      {aviso && <p className="info">{aviso}</p>}
      {erro && (
        <p ref={caixaErro} className="alerta" role="alert">
          {erro}
        </p>
      )}
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

/**
 * Qualidade do vídeo da galeria para caber em `alvoBytes`: menos bits por segundo (e imagem menor)
 * quanto mais longa a cena. Ex.: 20 s → 720p a 1,5 Mbps; 1:30 → 720p a ~0,9 Mbps; 3:00 → 540p a ~0,4 Mbps.
 */
export function qualidadeParaGaleria(duracaoMs: number, alvoBytes: number) {
  const seg = Math.max(5, duracaoMs / 1000 + 1);
  const audio = seg > 120 ? 64_000 : 96_000;
  const total = (alvoBytes * 8) / seg;
  // No máximo ~1 Mbit/s: na tela do celular fica igual, e cada dub ocupa ~40% menos (o plano grátis do servidor rende mais).
  const video = Math.round(Math.min(1_000_000, Math.max(200_000, total - audio - 30_000)));
  const largura = video >= 850_000 ? 720 : video >= 450_000 ? 540 : 426;
  return { video, audio, largura };
}
