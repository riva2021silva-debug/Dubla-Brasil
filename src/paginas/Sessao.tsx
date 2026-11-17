import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Legenda, { falaNoTempo } from "../componentes/Legenda";
import LinhaDoTempo from "../componentes/LinhaDoTempo";
import { useConfig } from "../config";
import { db } from "../db";
import { buscarCena, useCarregar, useMidiasDaCena, useTempoDoVideo } from "../ganchos";
import { decodificar, Mixer } from "../audio/mixer";
import { irPara } from "../audio/sincronia";
import type { Cena, Dub } from "../tipos";
import { baixarArquivo, formatarTempo, nomeArquivo } from "../util";

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
  const tempo = useTempoDoVideo(video);

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

  const exportar = async () => {
    const m = mixer.current;
    const formato = formatoDeExportacao();
    if (!video || !m) return;
    if (!formato) return setErro("Este aparelho não consegue gerar vídeos. Atualize o sistema ou use o Chrome no computador.");
    setErro(null);
    await m.ctx.resume();
    video.pause();
    await irPara(video, 0);

    const largura = video.videoWidth || 1280;
    const altura = video.videoHeight || 720;
    const tela = document.createElement("canvas");
    tela.width = largura;
    tela.height = altura;
    const g = tela.getContext("2d")!;
    const destino = m.ctx.createMediaStreamDestination();
    m.saida.connect(destino);
    const fluxo = new MediaStream([...tela.captureStream(30).getVideoTracks(), ...destino.stream.getAudioTracks()]);
    const gravador = new MediaRecorder(fluxo, { mimeType: formato.mime, videoBitsPerSecond: 5_000_000 });
    const partes: Blob[] = [];
    gravador.ondataavailable = (e) => e.data.size && partes.push(e.data);

    let raf = 0;
    let cancelado = false;
    const desenhar = () => {
      g.drawImage(video, 0, 0, largura, altura);
      const ms = video.currentTime * 1000;
      if (cfg.mostrarLegendas) {
        const f = falaNoTempo(cena.falas, ms);
        if (f?.texto.trim()) {
          const tam = Math.round(altura * 0.045);
          g.font = `800 ${tam}px Inter, system-ui, sans-serif`;
          g.textAlign = "center";
          const texto = f.texto;
          const w = Math.min(largura * 0.9, g.measureText(texto).width + tam);
          g.fillStyle = "rgba(0,0,0,0.72)";
          g.fillRect((largura - w) / 2, altura * 0.86 - tam * 1.1, w, tam * 1.5);
          g.fillStyle = "#fff";
          g.fillText(texto, largura / 2, altura * 0.86, largura * 0.88);
        }
      }
      g.font = `700 ${Math.round(altura * 0.028)}px Inter, system-ui, sans-serif`;
      g.textAlign = "right";
      g.fillStyle = "rgba(250,204,21,0.9)";
      g.fillText("Dubla Brasil", largura - 16, Math.round(altura * 0.05));
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
    gravador.onstop = () => {
      m.saida.disconnect(destino);
      fluxo.getTracks().forEach((t) => t.stop());
      setExportando(null);
      cancelar.current = () => {};
      if (!cancelado)
        baixarArquivo(new Blob(partes, { type: formato.mime.split(";")[0] }), `${nomeArquivo(dub.nome)}.${formato.ext}`).catch(
          (e) => setErro(`Não foi possível salvar o vídeo: ${e instanceof Error ? e.message : String(e)}`),
        );
    };
    video.addEventListener("ended", terminar);
    gravador.start(1000);
    desenhar();
    await video.play();
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

      <div className="palco">
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
        {cfg.mostrarLegendas && <Legenda falas={cena.falas} personagens={cena.personagens} tempoMs={tempo} />}
      </div>

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
        {exportando === null ? (
          <button className="botao botao-grande" onClick={exportar} disabled={!pronto}>
            ⬇ Baixar vídeo
          </button>
        ) : (
          <>
            <span className="etiqueta">Gerando vídeo… {Math.round(exportando * 100)}%</span>
            <button className="botao botao-perigo" onClick={() => cancelar.current()}>
              Cancelar
            </button>
          </>
        )}
        <span className="tempo">
          {formatarTempo(tempo)} / {formatarTempo(cena.duracaoMs)}
        </span>
      </div>
      {exportando !== null && (
        <p className="suave pequeno">O vídeo é gerado em tempo real: deixe esta aba aberta até terminar.</p>
      )}
    </div>
  );
}
