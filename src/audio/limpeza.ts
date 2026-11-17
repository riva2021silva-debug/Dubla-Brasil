// Limpeza e alinhamento da voz gravada (roda no aparelho, depois de cada gravação).

/** Filtro passa-altas de 2ª ordem (corta ronco, vento e vibração abaixo de ~80 Hz). */
function passaAltas(x: Float32Array, taxa: number, corte = 80): Float32Array {
  const w = (2 * Math.PI * corte) / taxa;
  const cos = Math.cos(w);
  const alfa = Math.sin(w) / (2 * Math.SQRT1_2);
  const a0 = 1 + alfa;
  const b0 = (1 + cos) / 2 / a0;
  const b1 = -(1 + cos) / a0;
  const b2 = (1 + cos) / 2 / a0;
  const a1 = (-2 * cos) / a0;
  const a2 = (1 - alfa) / a0;
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x[i];
    y2 = y1;
    y1 = v;
    y[i] = v;
  }
  return y;
}

/**
 * Deixa a voz mais limpa: corta graves de ruído, abafa o chiado nos trechos sem fala
 * (porta de ruído suave) e equilibra o volume (sem estourar).
 */
export function limparVoz(entrada: Float32Array, taxa: number): Float32Array {
  const x = passaAltas(entrada, taxa);
  const passo = Math.max(1, Math.round(taxa * 0.01)); // quadros de 10 ms
  const n = Math.ceil(x.length / passo);
  const energia = new Float32Array(n);
  for (let q = 0; q < n; q++) {
    let s = 0;
    const a = q * passo;
    const b = Math.min(x.length, a + passo);
    for (let i = a; i < b; i++) s += x[i] * x[i];
    energia[q] = Math.sqrt(s / Math.max(1, b - a));
  }
  // Nível do ruído de fundo = os 15% de quadros mais silenciosos.
  const ordenada = Array.from(energia).sort((a, b) => a - b);
  const ruido = ordenada[Math.floor(ordenada.length * 0.15)] ?? 0;
  const pico = ordenada[ordenada.length - 1] ?? 0;
  const limiar = Math.max(ruido * 3, pico * 0.04);
  // Ganho por quadro: 1 na fala, 0,12 no silêncio, com subida rápida e descida suave (sem "cortar" palavras).
  const ganho = new Float32Array(n);
  let atual = 0.12;
  for (let q = 0; q < n; q++) {
    const alvo = energia[q] > limiar ? 1 : 0.12;
    atual = alvo > atual ? atual + (alvo - atual) * 0.6 : atual + (alvo - atual) * 0.08;
    ganho[q] = atual;
  }
  // Mantém a voz aberta um pouco antes de cada fala começar (o ganho reage 30 ms adiantado).
  for (let q = 0; q < n - 3; q++) ganho[q] = Math.max(ganho[q], ganho[q + 3]);
  const y = new Float32Array(x.length);
  let maximo = 0;
  for (let i = 0; i < x.length; i++) {
    const q = Math.min(n - 1, Math.floor(i / passo));
    const proximo = Math.min(n - 1, q + 1);
    const t = (i % passo) / passo;
    y[i] = x[i] * (ganho[q] * (1 - t) + ganho[proximo] * t);
    maximo = Math.max(maximo, Math.abs(y[i]));
  }
  // Volume: leva o pico a -1 dB, mas sem aumentar mais que 4x (para não destacar o ruído).
  const fator = maximo > 0 ? Math.min(4, 0.89 / maximo) : 1;
  if (fator !== 1) for (let i = 0; i < y.length; i++) y[i] *= fator;
  return y;
}

function envelope(dados: Float32Array, taxa: number, passoMs = 10): Float32Array {
  const passo = Math.max(1, Math.round((taxa * passoMs) / 1000));
  const n = Math.floor(dados.length / passo);
  const e = new Float32Array(n);
  for (let q = 0; q < n; q++) {
    let s = 0;
    for (let i = q * passo; i < (q + 1) * passo; i++) s += dados[i] * dados[i];
    e[q] = Math.sqrt(s / passo);
  }
  return e;
}

/**
 * Quanto a voz gravada está atrasada (+) ou adiantada (−) em relação à fala original, em ms.
 * Compara o desenho do volume da voz com o do áudio original no mesmo trecho.
 * Devolve 0 quando não há certeza suficiente.
 */
export function estimarAtrasoMs(original: AudioBuffer, inicioMs: number, gravada: Float32Array, taxaGravada: number, maxMs = 300): number {
  const taxaO = original.sampleRate;
  const a = Math.max(0, Math.floor((inicioMs / 1000) * taxaO));
  const b = Math.min(original.length, a + Math.floor((gravada.length / taxaGravada) * taxaO));
  if (b - a < taxaO * 0.3) return 0;
  const eo = envelope(original.getChannelData(0).subarray(a, b), taxaO);
  const eg = envelope(gravada, taxaGravada);
  const n = Math.min(eo.length, eg.length);
  if (n < 30) return 0;
  const media = (e: Float32Array) => e.slice(0, n).reduce((s, v) => s + v, 0) / n;
  const mo = media(eo);
  const mg = media(eg);
  const maxLag = Math.round(maxMs / 10);
  let melhor = 0;
  let melhorCorr = -1;
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    let s = 0, so = 0, sg = 0;
    for (let i = 0; i < n; i++) {
      const j = i + lag; // a voz gravada no quadro j corresponde ao original no quadro i
      if (j < 0 || j >= n) continue;
      const do_ = eo[i] - mo;
      const dg = eg[j] - mg;
      s += do_ * dg;
      so += do_ * do_;
      sg += dg * dg;
    }
    const corr = so > 0 && sg > 0 ? s / Math.sqrt(so * sg) : -1;
    if (corr > melhorCorr) {
      melhorCorr = corr;
      melhor = lag;
    }
  }
  // Só corrige quando a semelhança é clara; um ajuste errado seria pior que nenhum.
  return melhorCorr >= 0.45 ? melhor * 10 : 0;
}
