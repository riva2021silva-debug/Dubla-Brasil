// Utilitários para controlar o vídeo e transformar gravações em tomadas alinhadas à cena.
import type { Fala, Tomada } from "../tipos";
import { paraWav, type Gravacao } from "./microfone";
import type { Mixer } from "./mixer";

export function irPara(video: HTMLVideoElement, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const alvo = Math.max(0, ms) / 1000;
    if (Math.abs(video.currentTime - alvo) < 0.001 && video.readyState >= 2) return resolve();
    const pronto = () => {
      video.removeEventListener("seeked", pronto);
      resolve();
    };
    video.addEventListener("seeked", pronto);
    video.currentTime = alvo;
  });
}

/** Folga gravada antes e depois de cada fala (para não cortar a respiração ou o fim da palavra). */
export const FOLGA_INICIO_MS = 250;
export const FOLGA_FIM_MS = 600;

/**
 * Converte a gravação em tomadas, uma por fala, já com o atraso compensado.
 * `cenaDaPrimeiraAmostra` é o tempo da cena (ms) em que a primeira amostra foi captada.
 */
export function fatiarEmTomadas(
  g: Gravacao,
  cenaDaPrimeiraAmostra: number,
  falas: Fala[],
  compensacaoMs: number,
): Record<string, Tomada> {
  const inicioReal = cenaDaPrimeiraAmostra - compensacaoMs;
  const saida: Record<string, Tomada> = {};
  for (const f of falas) {
    const de = f.inicioMs - FOLGA_INICIO_MS;
    const ate = f.fimMs + FOLGA_FIM_MS;
    const i = Math.max(0, Math.round(((de - inicioReal) / 1000) * g.taxa));
    const z = Math.min(g.amostras.length, Math.round(((ate - inicioReal) / 1000) * g.taxa));
    if (z - i < g.taxa * 0.1) continue;
    const amostras = g.amostras.slice(i, z);
    saida[f.id] = {
      audio: paraWav(amostras, g.taxa),
      inicioMs: inicioReal + (i / g.taxa) * 1000,
      duracaoMs: (amostras.length / g.taxa) * 1000,
      gravadaEm: Date.now(),
    };
  }
  return saida;
}

/** Atraso total entre o som sair e a voz voltar pelo microfone (saída do sistema + ajuste manual). */
export function compensacao(mixer: Mixer, ajusteMs: number): number {
  const ctx = mixer.ctx;
  const saida = (ctx.outputLatency || ctx.baseLatency || 0) * 1000;
  return saida + ajusteMs;
}

/** Pico do sinal (0 a 1): para avisar quando a gravação ficou muda. */
export function picoDe(g: Gravacao): number {
  let p = 0;
  for (let i = 0; i < g.amostras.length; i += 8) p = Math.max(p, Math.abs(g.amostras[i]));
  return p;
}
