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

// ---------- Redutor de chiado (subtração espectral) ----------

const N_FFT = 1024;
const SALTO_FFT = N_FFT / 4;

function fftNoLugar(re: Float64Array, im: Float64Array, inversa: boolean) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let tam = 2; tam <= n; tam <<= 1) {
    const ang = ((inversa ? 2 : -2) * Math.PI) / tam;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += tam) {
      let cr = 1, ci = 0;
      for (let k = 0; k < tam / 2; k++) {
        const a = i + k, b = a + tam / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

/**
 * Tira o chiado constante (ruído do microfone, ventilador, "shhh"): mede o ruído nos momentos mais quietos
 * e subtrai essa "impressão digital" de cada faixa de frequência. A voz passa; o chiado some.
 */
export function reduzirChiado(x: Float32Array, forca = 1.6, piso = 0.08): Float32Array {
  if (x.length < N_FFT * 4) return x;
  const janela = Float64Array.from({ length: N_FFT }, (_, i) => Math.sqrt(0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N_FFT)));
  const quadros = Math.floor((x.length - N_FFT) / SALTO_FFT) + 1;
  const bins = N_FFT / 2 + 1;
  const mags: Float32Array[] = [];
  const fases: { re: Float64Array; im: Float64Array }[] = [];
  const energia = new Float64Array(quadros);
  for (let q = 0; q < quadros; q++) {
    const re = new Float64Array(N_FFT), im = new Float64Array(N_FFT);
    for (let i = 0; i < N_FFT; i++) re[i] = x[q * SALTO_FFT + i] * janela[i];
    fftNoLugar(re, im, false);
    const m = new Float32Array(bins);
    for (let k = 0; k < bins; k++) {
      m[k] = Math.hypot(re[k], im[k]);
      energia[q] += m[k] * m[k];
    }
    mags.push(m);
    fases.push({ re, im });
  }
  // Ruído = média dos 20% de quadros mais quietos (onde a pessoa não está falando).
  const ordem = Array.from(energia.keys()).sort((a, b) => energia[a] - energia[b]);
  // Sem silêncio de verdade na gravação (fala ou som contínuo, sem pausa): não dá para saber o que é chiado,
  // então não mexe (melhor deixar um pouco de chiado do que comer a voz).
  const quieto = energia[ordem[Math.floor(quadros * 0.2)]], forte = energia[ordem[Math.floor(quadros * 0.9)]];
  if (!(quieto < forte * 0.1)) return x;
  const quietos = ordem.slice(0, Math.max(3, Math.floor(quadros * 0.2)));
  const ruido = new Float32Array(bins);
  for (const q of quietos) for (let k = 0; k < bins; k++) ruido[k] += mags[q][k] / quietos.length;

  const y = new Float64Array(x.length);
  const ganhoAnterior = new Float32Array(bins).fill(1);
  for (let q = 0; q < quadros; q++) {
    const { re, im } = fases[q];
    for (let k = 0; k < bins; k++) {
      const alvo = Math.max(piso, 1 - (forca * ruido[k]) / (mags[q][k] + 1e-9));
      // Sobe rápido (não come o começo das palavras) e desce suave (sem "barulhinho de robô").
      const g = alvo > ganhoAnterior[k] ? alvo : ganhoAnterior[k] * 0.7 + alvo * 0.3;
      ganhoAnterior[k] = g;
      re[k] *= g;
      im[k] *= g;
      if (k > 0 && k < N_FFT / 2) {
        re[N_FFT - k] = re[k];
        im[N_FFT - k] = -im[k];
      }
    }
    fftNoLugar(re, im, true);
    for (let i = 0; i < N_FFT; i++) y[q * SALTO_FFT + i] += (re[i] / N_FFT) * janela[i];
  }
  // Janela √Hann com 75% de sobreposição soma 2 (análise × síntese).
  const saida = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) saida[i] = y[i] / 2;
  return saida;
}

/**
 * Deixa a voz mais limpa: corta graves de ruído, tira o chiado, abafa o que sobra nos trechos sem fala
 * (porta de ruído suave) e equilibra o volume (sem estourar).
 */
export function limparVoz(entrada: Float32Array, taxa: number): Float32Array {
  const x = reduzirChiado(passaAltas(entrada, taxa));
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
  const forte = ordenada[Math.floor(ordenada.length * 0.9)] ?? 0;
  // Sem pausa de verdade (fala contínua): não abafa nada.
  const semPausa = !(ruido < forte * 0.316);
  const limiar = semPausa ? 0 : Math.max(ruido * 3, pico * 0.04);
  // Ganho por quadro: 1 na fala, 0,04 no silêncio, com subida rápida e descida suave (sem "cortar" palavras).
  const ganho = new Float32Array(n);
  let atual = 0.04;
  for (let q = 0; q < n; q++) {
    const alvo = energia[q] > limiar ? 1 : 0.04;
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
  // Volume: leva o pico a -1 dB, mas sem aumentar mais que 3x (para não destacar o ruído).
  const fator = maximo > 0 ? Math.min(3, 0.89 / maximo) : 1;
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
