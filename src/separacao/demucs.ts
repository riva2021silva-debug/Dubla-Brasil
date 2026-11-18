// Separa a voz do resto (música e efeitos) com o HTDemucs (Meta, licença MIT), num modelo ONNX que recebe
// o áudio e o espectro e devolve 4 partes: bateria, baixo, outros e VOZ. A "trilha de fundo" é tudo menos a voz.
// Este arquivo só tem a matemática (sem tela, sem rede): o modelo roda pela função `rodar` que vem de fora.

export const TAXA = 44100;
/** Pedaço que o modelo aceita de uma vez (7,8 s). */
export const PEDACO = 343980;
const NFFT = 4096;
const SALTO = 1024;
const FREQS = NFFT / 2; // o modelo usa 2048 faixas (descarta a última)
const QUADROS = Math.ceil(PEDACO / SALTO); // 336
const FONTES = 4; // bateria, baixo, outros, voz
export const VOZ = 3;

export type RodarModelo = (onda: Float32Array, espectro: Float32Array) => Promise<{ espectro: Float32Array; onda: Float32Array }>;

// ---------- FFT (raiz 2, no lugar) ----------
const COS = new Float64Array(NFFT / 2);
const SEN = new Float64Array(NFFT / 2);
for (let i = 0; i < NFFT / 2; i++) {
  COS[i] = Math.cos((2 * Math.PI * i) / NFFT);
  SEN[i] = Math.sin((2 * Math.PI * i) / NFFT);
}
const REV = new Uint32Array(NFFT);
for (let i = 0, bits = Math.log2(NFFT); i < NFFT; i++) {
  let r = 0;
  for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
  REV[i] = r;
}
/** FFT direta (inversa=false) ou inversa sem dividir por N. */
function fft(re: Float64Array, im: Float64Array, inversa: boolean) {
  for (let i = 0; i < NFFT; i++) {
    const j = REV[i];
    if (j > i) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  const s = inversa ? 1 : -1;
  for (let tam = 2; tam <= NFFT; tam <<= 1) {
    const meio = tam >> 1, passo = NFFT / tam;
    for (let i = 0; i < NFFT; i += tam)
      for (let k = 0; k < meio; k++) {
        const c = COS[k * passo], sn = s * SEN[k * passo];
        const a = i + k, b = a + meio;
        const tr = re[b] * c - im[b] * sn, ti = re[b] * sn + im[b] * c;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
      }
  }
}
// Janela de Hann "periódica" (a do torch.hann_window).
const JANELA = Float64Array.from({ length: NFFT }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / NFFT));
const ESCALA = 1 / Math.sqrt(NFFT); // normalized=True

/** Espelha o sinal nas bordas (pad "reflect" do torch). */
function espelhar(x: Float32Array, esq: number, dir: number): Float32Array {
  const n = x.length, saida = new Float32Array(n + esq + dir);
  for (let i = 0; i < saida.length; i++) {
    let j = i - esq;
    while (j < 0 || j >= n) j = j < 0 ? -j : 2 * (n - 1) - j;
    saida[i] = x[j];
  }
  return saida;
}

/** Espectro de um canal do pedaço, como o HTDemucs faz (_spec): [re, im] de 2048 × 336. */
function espectroDoCanal(x: Float32Array): { re: Float32Array; im: Float32Array } {
  const pad = (SALTO / 2) * 3;
  const y = espelhar(espelhar(x, pad, pad + QUADROS * SALTO - x.length), NFFT / 2, NFFT / 2); // + center=True
  const re = new Float32Array(FREQS * QUADROS), im = new Float32Array(FREQS * QUADROS);
  const fr = new Float64Array(NFFT), fi = new Float64Array(NFFT);
  for (let t = 0; t < QUADROS; t++) {
    const ini = (t + 2) * SALTO; // descarta os 2 primeiros quadros
    for (let i = 0; i < NFFT; i++) {
      fr[i] = y[ini + i] * JANELA[i];
      fi[i] = 0;
    }
    fft(fr, fi, false);
    for (let f = 0; f < FREQS; f++) {
      re[f * QUADROS + t] = fr[f] * ESCALA;
      im[f * QUADROS + t] = fi[f] * ESCALA;
    }
  }
  return { re, im };
}

/** Volta do espectro para o som (_ispec do HTDemucs), com `n` amostras. */
function ondaDoEspectro(re: Float32Array, im: Float32Array, n: number): Float32Array {
  const pad = (SALTO / 2) * 3;
  const le = SALTO * Math.ceil(n / SALTO) + 2 * pad;
  const total = QUADROS + 4; // 2 quadros vazios de cada lado
  const comprimento = NFFT + SALTO * (total - 1);
  const soma = new Float64Array(comprimento), peso = new Float64Array(comprimento);
  const fr = new Float64Array(NFFT), fi = new Float64Array(NFFT);
  for (let q = 0; q < total; q++) {
    const t = q - 2;
    fr.fill(0);
    fi.fill(0);
    if (t >= 0 && t < QUADROS) {
      for (let f = 0; f < FREQS; f++) {
        fr[f] = re[f * QUADROS + t];
        fi[f] = im[f * QUADROS + t];
      }
      for (let f = 1; f < NFFT / 2; f++) {
        fr[NFFT - f] = fr[f];
        fi[NFFT - f] = -fi[f];
      }
      fi[0] = 0;
      fft(fr, fi, true);
    }
    const ini = q * SALTO;
    for (let i = 0; i < NFFT; i++) {
      soma[ini + i] += (fr[i] / NFFT) * (1 / ESCALA) * JANELA[i];
      peso[ini + i] += JANELA[i] * JANELA[i];
    }
  }
  const saida = new Float32Array(n);
  const corte = NFFT / 2 + pad; // center=True e depois o recorte do _ispec
  for (let i = 0; i < n; i++) {
    const j = corte + i;
    saida[i] = j < le + NFFT / 2 && peso[j] > 1e-10 ? soma[j] / peso[j] : 0;
  }
  return saida;
}

/** Roda o modelo num pedaço (2 canais × PEDACO) e devolve as 4 fontes (fonte × canal × PEDACO). */
async function separarPedaco(esq: Float32Array, dir: Float32Array, rodar: RodarModelo): Promise<Float32Array[][]> {
  const onda = new Float32Array(2 * PEDACO);
  onda.set(esq, 0);
  onda.set(dir, PEDACO);
  const e = espectroDoCanal(esq), d = espectroDoCanal(dir);
  const plano = FREQS * QUADROS;
  const espectro = new Float32Array(4 * plano);
  espectro.set(e.re, 0);
  espectro.set(e.im, plano);
  espectro.set(d.re, 2 * plano);
  espectro.set(d.im, 3 * plano);
  const r = await rodar(onda, espectro);
  const fontes: Float32Array[][] = [];
  for (let s = 0; s < FONTES; s++) {
    const canais: Float32Array[] = [];
    for (let c = 0; c < 2; c++) {
      const base = ((s * 4 + c * 2) * plano);
      const doEspectro = ondaDoEspectro(r.espectro.subarray(base, base + plano), r.espectro.subarray(base + plano, base + 2 * plano), PEDACO);
      const doTempo = r.onda.subarray((s * 2 + c) * PEDACO, (s * 2 + c + 1) * PEDACO);
      const soma = new Float32Array(PEDACO);
      for (let i = 0; i < PEDACO; i++) soma[i] = doTempo[i] + doEspectro[i];
      canais.push(soma);
    }
    fontes.push(canais);
  }
  return fontes;
}

/**
 * Separa um áudio estéreo (44,1 kHz) em voz e fundo. Pedaços de 7,8 s com 25% de sobreposição,
 * misturados com peso em triângulo (como o Demucs faz), para não ter emenda.
 */
export async function separarVoz(
  esq: Float32Array,
  dir: Float32Array,
  rodar: RodarModelo,
  aoProgredir: (fracao: number) => void = () => {},
): Promise<{ fundo: [Float32Array, Float32Array]; voz: [Float32Array, Float32Array] }> {
  const n = esq.length;
  // Normaliza (como o separate.py do Demucs) e desfaz no fim.
  let media = 0;
  for (let i = 0; i < n; i++) media += (esq[i] + dir[i]) / 2;
  media /= n || 1;
  let variancia = 0;
  for (let i = 0; i < n; i++) variancia += ((esq[i] + dir[i]) / 2 - media) ** 2;
  const desvio = Math.sqrt(variancia / Math.max(1, n - 1)) || 1;
  const norm = (x: Float32Array) => Float32Array.from(x, (v) => (v - media) / desvio);
  const E = norm(esq), D = norm(dir);

  const passo = Math.floor(PEDACO * 0.75);
  const peso = new Float32Array(PEDACO);
  for (let i = 0; i < PEDACO; i++) peso[i] = Math.min(i + 1, PEDACO - i) / Math.ceil(PEDACO / 2);
  const acc = [0, 1, 2, 3].map(() => [new Float32Array(n), new Float32Array(n)]);
  const somaPeso = new Float32Array(n);
  const inicios: number[] = [];
  for (let o = 0; o < n; o += passo) {
    inicios.push(o);
    if (o + PEDACO >= n) break;
  }
  for (let k = 0; k < inicios.length; k++) {
    const o = inicios[k];
    const pe = new Float32Array(PEDACO), pd = new Float32Array(PEDACO);
    pe.set(E.subarray(o, Math.min(n, o + PEDACO)));
    pd.set(D.subarray(o, Math.min(n, o + PEDACO)));
    const fontes = await separarPedaco(pe, pd, rodar);
    const fim = Math.min(n, o + PEDACO);
    for (let s = 0; s < FONTES; s++)
      for (let c = 0; c < 2; c++) {
        const a = acc[s][c], f = fontes[s][c];
        for (let i = o; i < fim; i++) a[i] += f[i - o] * peso[i - o];
      }
    for (let i = o; i < fim; i++) somaPeso[i] += peso[i - o];
    aoProgredir((k + 1) / inicios.length);
  }
  const fundo: [Float32Array, Float32Array] = [new Float32Array(n), new Float32Array(n)];
  const voz: [Float32Array, Float32Array] = [new Float32Array(n), new Float32Array(n)];
  for (let c = 0; c < 2; c++)
    for (let i = 0; i < n; i++) {
      const w = somaPeso[i] || 1;
      voz[c][i] = (acc[VOZ][c][i] / w) * desvio + media / FONTES;
      fundo[c][i] = ((acc[0][c][i] + acc[1][c][i] + acc[2][c][i]) / w) * desvio + (media * 3) / FONTES;
    }
  return { fundo, voz };
}
