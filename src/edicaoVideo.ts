// Edição simples de vídeo no próprio aparelho (área do administrador): cortar o começo/fim e mudar o formato
// (em pé 9:16, quadrado 1:1 ou deitado 16:9) recortando a imagem. O vídeo é tocado do início ao fim do corte
// e regravado com a imagem recortada e o som original — leva o mesmo tempo do trecho.
import { paraWav } from "./audio/microfone";
import { decodificar } from "./audio/mixer";
import type { Fala } from "./tipos";

export type Formato = "original" | "9:16" | "1:1" | "16:9";

export interface Edicao {
  inicioMs: number;
  fimMs: number;
  formato: Formato;
  /** Posição do recorte, de 0 (esquerda/topo) a 1 (direita/baixo). */
  posicao: number;
}

export const PROPORCAO: Record<Exclude<Formato, "original">, number> = { "9:16": 9 / 16, "1:1": 1, "16:9": 16 / 9 };

/** Área do vídeo original que fica no resultado (em pixels do vídeo). */
export function areaDoRecorte(largura: number, altura: number, formato: Formato, posicao: number) {
  if (formato === "original") return { x: 0, y: 0, l: largura, a: altura };
  const alvo = PROPORCAO[formato];
  if (largura / altura > alvo) {
    const l = Math.round(altura * alvo);
    return { x: Math.round((largura - l) * posicao), y: 0, l, a: altura };
  }
  const a = Math.round(largura / alvo);
  return { x: 0, y: Math.round((altura - a) * posicao), l: largura, a };
}

export function formatoDeVideo(): { mime: string; ext: string } | null {
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

const par = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/**
 * Regrava o trecho escolhido com o novo formato. `aoProgredir` recebe de 0 a 1.
 * Devolve o arquivo novo, ou null se cancelado (chame `cancelar()` do objeto devolvido em `controle`).
 */
export function processarVideo(
  url: string,
  ed: Edicao,
  aoProgredir: (p: number) => void,
  controle: { cancelar?: () => void },
): Promise<File | null> {
  return new Promise((resolve, reject) => {
    const formato = formatoDeVideo();
    if (!formato) return reject(new Error("Este aparelho não consegue gerar vídeos. Use o Chrome atualizado."));
    const v = document.createElement("video");
    v.crossOrigin = "anonymous";
    v.playsInline = true;
    v.preload = "auto";
    v.src = url;
    let ctx: AudioContext | null = null;
    let gravador: MediaRecorder | null = null;
    let cancelado = false;
    let terminou = false;
    const partes: Blob[] = [];

    const limpar = () => {
      v.pause();
      v.removeAttribute("src");
      v.load();
      void ctx?.close();
    };
    const falhar = (e: unknown) => {
      if (terminou) return;
      terminou = true;
      limpar();
      reject(e instanceof Error ? e : new Error("Não foi possível ler este vídeo."));
    };
    v.onerror = () => falhar(new Error("Não foi possível ler este vídeo."));

    v.onloadedmetadata = async () => {
      try {
        const area = areaDoRecorte(v.videoWidth, v.videoHeight, ed.formato, ed.posicao);
        // Não aumenta o tamanho (perderia qualidade e pesaria mais); limita o lado maior a 1280.
        const escala = Math.min(1, 1280 / Math.max(area.l, area.a));
        const tela = document.createElement("canvas");
        tela.width = par(area.l * escala);
        tela.height = par(area.a * escala);
        const g = tela.getContext("2d")!;

        ctx = new AudioContext();
        const fonte = ctx.createMediaElementSource(v);
        const destino = ctx.createMediaStreamDestination();
        fonte.connect(destino); // só vai para a gravação (não toca no alto-falante)
        await ctx.resume();

        const fluxo = new MediaStream([...tela.captureStream(30).getVideoTracks(), ...destino.stream.getAudioTracks()]);
        const pixels = tela.width * tela.height;
        gravador = new MediaRecorder(fluxo, {
          mimeType: formato.mime,
          videoBitsPerSecond: Math.round(Math.min(3_000_000, Math.max(1_200_000, pixels * 3))),
          audioBitsPerSecond: 128_000,
        });
        gravador.ondataavailable = (e) => e.data.size && partes.push(e.data);
        gravador.onstop = () => {
          fluxo.getTracks().forEach((t) => t.stop());
          limpar();
          if (cancelado) return resolve(null);
          const tipo = formato.mime.split(";")[0];
          resolve(new File([new Blob(partes, { type: tipo })], `cena-editada.${formato.ext}`, { type: tipo }));
        };

        const desenhar = () => g.drawImage(v, area.x, area.y, area.l, area.a, 0, 0, tela.width, tela.height);
        const parar = () => {
          if (terminou) return;
          terminou = true;
          if (gravador?.state !== "inactive") gravador?.stop();
        };
        controle.cancelar = () => {
          cancelado = true;
          parar();
        };

        // Vai para o começo do corte e espera o quadro aparecer.
        v.currentTime = ed.inicioMs / 1000;
        await new Promise<void>((ok) => v.addEventListener("seeked", () => ok(), { once: true }));
        desenhar();

        const total = Math.max(1, ed.fimMs - ed.inicioMs);
        const passo = () => {
          if (terminou) return;
          desenhar();
          const ms = v.currentTime * 1000;
          aoProgredir(Math.min(1, (ms - ed.inicioMs) / total));
          if (ms >= ed.fimMs || v.ended) return parar();
          requestAnimationFrame(passo);
        };
        v.onended = parar;
        gravador.start(1000);
        await v.play();
        requestAnimationFrame(passo);
      } catch (e) {
        falhar(e);
      }
    };
  });
}

/** Corta a trilha de fundo no mesmo trecho (vira WAV). */
export async function cortarAudio(url: string, inicioMs: number, fimMs: number): Promise<File> {
  const ctx = new OfflineAudioContext(1, 1, 44100);
  const buf = await decodificar(ctx, await (await fetch(url)).blob());
  const ini = Math.floor((inicioMs / 1000) * buf.sampleRate);
  const fim = Math.min(buf.length, Math.ceil((fimMs / 1000) * buf.sampleRate));
  const mono = new Float32Array(Math.max(0, fim - ini));
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < mono.length; i++) mono[i] += d[ini + i] / buf.numberOfChannels;
  }
  return new File([paraWav(mono, buf.sampleRate)], "fundo-editado.wav", { type: "audio/wav" });
}

/** Ajusta as falas ao corte: tira as que ficaram de fora e muda os tempos das outras. */
export function ajustarFalas(falas: Fala[], inicioMs: number, fimMs: number): Fala[] {
  const dur = fimMs - inicioMs;
  return falas
    // Fica só a fala que tem pelo menos 0,3 s dentro do trecho.
    .filter((f) => Math.min(f.fimMs, fimMs) - Math.max(f.inicioMs, inicioMs) >= 300)
    .map((f) => ({ ...f, inicioMs: Math.max(0, f.inicioMs - inicioMs), fimMs: Math.min(dur, f.fimMs - inicioMs) }));
}
