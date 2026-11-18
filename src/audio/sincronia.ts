// Utilitários para controlar o vídeo e transformar gravações em tomadas alinhadas à cena.
import type { Fala, Tomada } from "../tipos";
import { estimarAtrasoMs, limparVoz } from "./limpeza";
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
  opcoes: { limpar?: boolean; alinharCom?: AudioBuffer | null; todasDaCena?: Fala[] } = {},
): Record<string, Tomada> {
  // Todas as falas da cena (de qualquer personagem), em ordem: a tomada nunca entra na fala de outra pessoa.
  const cena = [...(opcoes.todasDaCena ?? falas)].sort((a, b) => a.inicioMs - b.inicioMs);
  const inicioReal = cenaDaPrimeiraAmostra - compensacaoMs;
  const saida: Record<string, Tomada> = {};
  const ordem = [...falas].sort((a, b) => a.inicioMs - b.inicioMs);
  for (let k = 0; k < ordem.length; k++) {
    const f = ordem[k];
    // As folgas não podem invadir a fala vizinha (senão o mesmo trecho toca duas vezes = eco): param no meio do caminho.
    const ant = ordem[k - 1], prox = ordem[k + 1];
    const vizinhas = limitesDaFala(f, cena);
    const de = Math.min(f.inicioMs, Math.max(f.inicioMs - FOLGA_INICIO_MS, ant ? (ant.fimMs + f.inicioMs) / 2 : -Infinity, vizinhas.antes));
    const ate = Math.max(f.fimMs, Math.min(f.fimMs + FOLGA_FIM_MS, prox ? (f.fimMs + prox.inicioMs) / 2 : Infinity, vizinhas.depois));
    const i = Math.max(0, Math.round(((de - inicioReal) / 1000) * g.taxa));
    const z = Math.min(g.amostras.length, Math.round(((ate - inicioReal) / 1000) * g.taxa));
    if (z - i < g.taxa * 0.1) continue;
    const bruta = g.amostras.slice(i, z);
    const amostras = opcoes.limpar ? limparVoz(bruta, g.taxa) : bruta;
    let inicioMs = inicioReal + (i / g.taxa) * 1000;
    // Alinha com a fala original: se a voz entrou atrasada (ou adiantada), puxa para o tempo certo.
    if (opcoes.alinharCom) inicioMs -= estimarAtrasoMs(opcoes.alinharCom, inicioMs, amostras, g.taxa);
    saida[f.id] = {
      audio: paraWav(amostras, g.taxa),
      inicioMs,
      duracaoMs: (amostras.length / g.taxa) * 1000,
      gravadaEm: Date.now(),
    };
  }
  return saida;
}

/**
 * Até onde a sobra de uma fala pode ir sem entrar na fala de outra pessoa: o fim da fala anterior e o começo da
 * próxima (de qualquer personagem). Como no "cada um na sua vez" de uma conversa.
 */
export function limitesDaFala(f: { id: string; inicioMs: number; fimMs: number }, cena: { id: string; inicioMs: number; fimMs: number }[]) {
  let antes = -Infinity, depois = Infinity;
  for (const o of cena) {
    if (o.id === f.id) continue;
    if (o.fimMs <= f.inicioMs + 1) antes = Math.max(antes, o.fimMs);
    if (o.inicioMs >= f.fimMs - 1) depois = Math.min(depois, o.inicioMs);
  }
  return { antes, depois };
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
