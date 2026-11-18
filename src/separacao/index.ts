// "✨ Gerar trilha de fundo com IA": tira as vozes do vídeo e devolve a trilha (música + efeitos) em WAV estéreo.
import type { MensagemSeparar } from "./trabalhador";

export interface ProgressoFundo {
  etapa: "lendo" | "baixando" | "preparando" | "separando";
  fracao: number;
  detalhe: string;
}

const TAXA = 44100;

/** Áudio do vídeo em estéreo, 44,1 kHz (o que o modelo espera). */
async function audioDoVideo(url: string): Promise<{ esq: Float32Array; dir: Float32Array }> {
  const r = await fetch(url);
  if (!r.ok) throw new Error("Não foi possível ler o vídeo.");
  const ctx = new OfflineAudioContext(2, 1, TAXA);
  const buf = await ctx.decodeAudioData(await r.arrayBuffer()).catch(() => {
    throw new Error("Não foi possível ler o áudio deste vídeo. Tente um MP4 comum (H.264 + AAC).");
  });
  const off = new OfflineAudioContext(2, Math.ceil(buf.duration * TAXA), TAXA);
  const f = off.createBufferSource();
  f.buffer = buf;
  f.connect(off.destination);
  f.start();
  const s = await off.startRendering();
  return { esq: s.getChannelData(0).slice(), dir: s.getChannelData(s.numberOfChannels > 1 ? 1 : 0).slice() };
}

/** WAV estéreo 16 bits. */
function wavEstereo(esq: Float32Array, dir: Float32Array, taxa: number): Blob {
  const n = esq.length;
  const dados = new DataView(new ArrayBuffer(44 + n * 4));
  const txt = (o: number, s: string) => [...s].forEach((c, i) => dados.setUint8(o + i, c.charCodeAt(0)));
  txt(0, "RIFF");
  dados.setUint32(4, 36 + n * 4, true);
  txt(8, "WAVE");
  txt(12, "fmt ");
  dados.setUint32(16, 16, true);
  dados.setUint16(20, 1, true);
  dados.setUint16(22, 2, true);
  dados.setUint32(24, taxa, true);
  dados.setUint32(28, taxa * 4, true);
  dados.setUint16(32, 4, true);
  dados.setUint16(34, 16, true);
  txt(36, "data");
  dados.setUint32(40, n * 4, true);
  for (let i = 0; i < n; i++) {
    dados.setInt16(44 + i * 4, Math.max(-1, Math.min(1, esq[i])) * 0x7fff, true);
    dados.setInt16(46 + i * 4, Math.max(-1, Math.min(1, dir[i])) * 0x7fff, true);
  }
  return new Blob([dados.buffer], { type: "audio/wav" });
}

export async function gerarTrilhaDeFundo(urlVideo: string, aoProgredir: (p: ProgressoFundo) => void): Promise<{ arquivo: File; motor: string }> {
  aoProgredir({ etapa: "lendo", fracao: 0, detalhe: "Lendo o áudio do vídeo…" });
  const { esq, dir } = await audioDoVideo(urlVideo);
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL("./trabalhador.ts", import.meta.url), { type: "module" });
    w.onmessage = (e: MessageEvent<MensagemSeparar>) => {
      const m = e.data;
      if (m.tipo === "progresso") aoProgredir({ etapa: m.etapa, fracao: m.fracao, detalhe: m.detalhe });
      else {
        w.terminate();
        if (m.tipo === "pronto") resolve({ arquivo: new File([wavEstereo(m.esq, m.dir, TAXA)], "fundo-ia.wav", { type: "audio/wav" }), motor: m.motor });
        else reject(new Error(/fetch|network|Failed to fetch|NetworkError/i.test(m.mensagem) ? "Sem internet para baixar a IA. Conecte-se e tente de novo." : m.mensagem));
      }
    };
    w.onerror = (e) => {
      w.terminate();
      reject(new Error(e.message || "A separação parou (o aparelho pode ter ficado sem memória). Tente num computador."));
    };
    let urlModelo: string | undefined;
    try {
      urlModelo = localStorage.getItem("dubla-brasil:url-modelo-fundo") || undefined; // só para testes
    } catch {
      /* sem armazenamento */
    }
    w.postMessage({ esq, dir, urlModelo }, [esq.buffer, dir.buffer]);
  });
}
