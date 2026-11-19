// Modo Cantar: nota de afinação de uma fala cantada. Compara o desenho da melodia (e o ritmo) da voz gravada com
// a voz do cantor original no mesmo trecho. A comparação é por "desenho" (relativo), então cantar uma oitava abaixo
// ou num tom mais confortável não tira ponto: o que conta é subir e descer junto com a melodia.
import { caracteristicas } from "./analise";

const TAXA = 16000;

/** Trecho [inicioMs, fimMs] de um AudioBuffer, em mono e 16 kHz. */
async function trechoMono(buf: AudioBuffer, inicioMs: number, fimMs: number): Promise<Float32Array> {
  const ini = Math.max(0, inicioMs / 1000);
  const dur = Math.max(0.05, Math.min(buf.duration, fimMs / 1000) - ini);
  const off = new OfflineAudioContext(1, Math.ceil(dur * TAXA), TAXA);
  const f = off.createBufferSource();
  f.buffer = buf;
  f.connect(off.destination);
  f.start(0, ini, dur);
  return (await off.startRendering()).getChannelData(0);
}

/**
 * Nota de 0 a 100 (ou null se o trecho original não tem voz cantada para comparar). Como nos jogos de karaokê:
 * em cada momento em que o cantor está cantando, conta se a pessoa está na mesma nota (até ~meio tom de diferença),
 * comparando o desenho da melodia de cada um (tom relativo à própria voz, então outro tom ou outra oitava vale).
 * Testa pequenos atrasos/adiantamentos (até 0,3 s) e fica com o melhor.
 */
export async function notaDeAfinacao(referencia: AudioBuffer, inicioMs: number, fimMs: number, tomada: AudioBuffer, tomadaInicioMs: number): Promise<number | null> {
  const ref = await trechoMono(referencia, inicioMs, fimMs);
  const minha = await trechoMono(tomada, inicioMs - tomadaInicioMs, fimMs - tomadaInicioMs);
  const a = caracteristicas(ref, TAXA);
  const b = caracteristicas(minha, TAXA);
  const cantados = a.tom.map((t, i) => (t === null ? -1 : i)).filter((i) => i >= 0);
  if (cantados.length < 5) return null;
  const maxDesvio = Math.round(300 / a.passoMs);
  let melhor = 0;
  for (let d = -maxDesvio; d <= maxDesvio; d++) {
    let pontos = 0;
    for (const i of cantados) {
      const tb = b.tom[i + d];
      if (tb === null || tb === undefined) continue;
      const dif = Math.abs((a.tom[i] as number) - tb);
      pontos += dif <= 0.75 ? 1 : dif <= 1.5 ? 0.5 : 0;
    }
    melhor = Math.max(melhor, pontos / cantados.length);
  }
  return Math.round(100 * melhor);
}

export function rotuloAfinacao(n: number): string {
  if (n >= 90) return "Afinadíssimo! 🌟";
  if (n >= 75) return "Muito bem! 🎶";
  if (n >= 55) return "Quase lá! 👍";
  if (n >= 35) return "Dá pra melhorar";
  return "Tente de novo";
}
