// Análise de voz: tom (altura da nota), energia e comparação entre duas gravações.

/** Detecta a frequência fundamental (Hz) de um trecho de áudio, ou null se for silêncio/ruído. Método YIN. */
export function tomDoQuadro(x: Float32Array, taxa: number, minHz = 70, maxHz = 1000, limiar = 0.15): number | null {
  const n = x.length;
  let soma = 0;
  for (let i = 0; i < n; i++) soma += x[i] * x[i];
  if (Math.sqrt(soma / n) < 0.01) return null;
  const minLag = Math.max(2, Math.floor(taxa / maxHz));
  const maxLag = Math.min(Math.floor(taxa / minHz), Math.floor(n / 2));
  if (maxLag <= minLag) return null;
  const w = n - maxLag;
  const d = new Float32Array(maxLag + 1);
  for (let tau = 1; tau <= maxLag; tau++) {
    let s = 0;
    for (let i = 0; i < w; i++) {
      const dif = x[i] - x[i + tau];
      s += dif * dif;
    }
    d[tau] = s;
  }
  // Diferença normalizada pela média acumulada.
  let acumulado = 0;
  const dn = new Float32Array(maxLag + 1);
  dn[0] = 1;
  for (let tau = 1; tau <= maxLag; tau++) {
    acumulado += d[tau];
    dn[tau] = acumulado > 0 ? (d[tau] * tau) / acumulado : 1;
  }
  let tau = -1;
  for (let t = minLag; t <= maxLag; t++) {
    if (dn[t] < limiar) {
      while (t + 1 <= maxLag && dn[t + 1] < dn[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) return null;
  // Interpolação parabólica para mais precisão.
  const a = dn[tau - 1] ?? dn[tau];
  const b = dn[tau];
  const c = dn[tau + 1] ?? dn[tau];
  const den = a - 2 * b + c;
  const ajuste = den !== 0 ? (a - c) / (2 * den) : 0;
  return taxa / (tau + ajuste);
}

export interface Caracteristicas {
  /** Energia por quadro, normalizada de 0 a 1. */
  energia: number[];
  /** Tom por quadro em semitons, relativo à mediana da própria gravação (null = sem tom). */
  tom: (number | null)[];
  passoMs: number;
}

const JANELA = 2048;

export function caracteristicas(amostras: Float32Array, taxa: number, passoMs = 20): Caracteristicas {
  const passo = Math.max(1, Math.round((taxa * passoMs) / 1000));
  const energia: number[] = [];
  const hz: (number | null)[] = [];
  const quadro = new Float32Array(JANELA);
  for (let i = 0; i + JANELA <= amostras.length || (i === 0 && amostras.length > 0); i += passo) {
    quadro.fill(0);
    quadro.set(amostras.subarray(i, Math.min(amostras.length, i + JANELA)));
    let s = 0;
    for (let k = 0; k < passo && i + k < amostras.length; k++) s += amostras[i + k] * amostras[i + k];
    energia.push(Math.sqrt(s / passo));
    hz.push(tomDoQuadro(quadro, taxa));
    if (i + JANELA > amostras.length) break;
  }
  const maxE = Math.max(1e-6, ...energia);
  const energiaN = energia.map((e) => e / maxE);
  const validos = hz.filter((f): f is number => f !== null).sort((a, b) => a - b);
  const mediana = validos.length ? validos[Math.floor(validos.length / 2)] : 0;
  const tom = hz.map((f, i) => (f && mediana && energiaN[i] > 0.12 ? 12 * Math.log2(f / mediana) : null));
  return { energia: energiaN, tom, passoMs };
}

/** Remove o silêncio do começo e do fim (quadros abaixo de 10% da energia máxima). */
function aparar(c: Caracteristicas): Caracteristicas {
  let i = 0;
  let f = c.energia.length - 1;
  while (i < f && c.energia[i] < 0.1) i++;
  while (f > i && c.energia[f] < 0.1) f--;
  return { energia: c.energia.slice(i, f + 1), tom: c.tom.slice(i, f + 1), passoMs: c.passoMs };
}

export interface Nota {
  /** Nota geral de 0 a 100. */
  nota: number;
  /** Semelhança do ritmo/volume (0 a 100). */
  ritmo: number;
  /** Semelhança da melodia da voz (0 a 100). */
  entonacao: number;
}

/**
 * Compara a imitação com o original. Alinha as duas no tempo (DTW), então falar um pouco mais rápido ou
 * mais devagar não pesa muito; compara o desenho do volume e o desenho da melodia (independe de a voz ser
 * mais grave ou mais aguda que a original).
 */
export function comparar(original: Caracteristicas, imitacao: Caracteristicas): Nota {
  const a = aparar(original);
  const b = aparar(imitacao);
  const n = a.energia.length;
  const m = b.energia.length;
  if (n < 3 || m < 3) return { nota: 0, ritmo: 0, entonacao: 0 };

  const custoE = (i: number, j: number) => Math.abs(a.energia[i] - b.energia[j]);
  const custoT = (i: number, j: number) => {
    const ta = a.tom[i];
    const tb = b.tom[j];
    if (ta === null && tb === null) return 0;
    if (ta === null || tb === null) return 0.5;
    return Math.min(Math.abs(ta - tb), 12) / 12;
  };
  // DTW com faixa (Sakoe-Chiba) para manter o alinhamento razoável.
  const faixa = Math.max(Math.abs(n - m), Math.round(Math.max(n, m) * 0.25));
  const INF = 1e9;
  const D = Array.from({ length: n + 1 }, () => new Float64Array(m + 1).fill(INF));
  const passos = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  const somaE = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  const somaT = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  D[0][0] = 0;
  for (let i = 1; i <= n; i++) {
    const jMin = Math.max(1, Math.round((i * m) / n) - faixa);
    const jMax = Math.min(m, Math.round((i * m) / n) + faixa);
    for (let j = jMin; j <= jMax; j++) {
      const e = custoE(i - 1, j - 1);
      const t = custoT(i - 1, j - 1);
      const c = e + t;
      let melhor = D[i - 1][j - 1];
      let pi = i - 1;
      let pj = j - 1;
      if (D[i - 1][j] < melhor) {
        melhor = D[i - 1][j];
        pi = i - 1;
        pj = j;
      }
      if (D[i][j - 1] < melhor) {
        melhor = D[i][j - 1];
        pi = i;
        pj = j - 1;
      }
      if (melhor >= INF) continue;
      D[i][j] = melhor + c;
      passos[i][j] = passos[pi][pj] + 1;
      somaE[i][j] = somaE[pi][pj] + e;
      somaT[i][j] = somaT[pi][pj] + t;
    }
  }
  if (D[n][m] >= INF) return { nota: 0, ritmo: 0, entonacao: 0 };
  const k = passos[n][m];
  const mediaE = somaE[n][m] / k;
  const mediaT = somaT[n][m] / k;
  // Penaliza diferença grande de duração (depois de aparar o silêncio).
  const razao = Math.min(n, m) / Math.max(n, m);
  const ritmo = Math.round(100 * Math.max(0, 1 - mediaE * 2.2) * (0.6 + 0.4 * razao));
  const entonacao = Math.round(100 * Math.max(0, 1 - mediaT * 2.4));
  const nota = Math.round(ritmo * 0.45 + entonacao * 0.55);
  return { nota, ritmo, entonacao };
}

export function rotuloDaNota(nota: number): string {
  if (nota >= 90) return "Perfeito!";
  if (nota >= 75) return "Muito bom!";
  if (nota >= 55) return "Quase lá!";
  if (nota >= 35) return "Dá pra melhorar";
  return "Tente de novo";
}
