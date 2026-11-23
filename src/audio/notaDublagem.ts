// Nota da dublagem (versão 5.8): compara QUANDO você falou com QUANDO o personagem fala na cena (sincronia),
// a duração da sua fala e se a voz ficou num volume bom. Não compara palavras: a dublagem é de ouvido, do seu jeito.

const QUADRO_MS = 20;
const TOLERANCIA_MS = 150;

/** Energia (RMS) de cada quadro de 20 ms. */
function envelope(dados: Float32Array, taxa: number, deMs: number, ateMs: number): number[] {
  const passo = Math.max(1, Math.round((taxa * QUADRO_MS) / 1000));
  const ini = Math.max(0, Math.round((deMs / 1000) * taxa));
  const fim = Math.min(dados.length, Math.round((ateMs / 1000) * taxa));
  const out: number[] = [];
  for (let i = ini; i + passo <= fim; i += passo) {
    let s = 0;
    for (let j = i; j < i + passo; j++) s += dados[j] * dados[j];
    out.push(Math.sqrt(s / passo));
  }
  return out;
}

const ativo = (env: number[], relativo: number, minimo: number) => {
  const max = Math.max(0, ...env);
  const corte = Math.max(minimo, max * relativo);
  return env.map((v) => v > corte);
};

/** Aceita um pouco antes ou depois (ninguém acerta no milissegundo). */
const dilatar = (a: boolean[], n: number) => a.map((_, i) => a.slice(Math.max(0, i - n), i + n + 1).some(Boolean));

const limitar = (x: number) => Math.max(0, Math.min(1, x));

/** Média de 5 quadros (100 ms): fica só o sobe e desce das sílabas. */
const suavizar = (a: number[]) => a.map((_, i) => {
  const p = a.slice(Math.max(0, i - 2), i + 3);
  return p.reduce((x, y) => x + y, 0) / p.length;
});

/** Correlação (−1 a 1) entre dois envelopes. Sem variação nenhuma (som constante) = 0. */
function correlacao(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) (ma += a[i]), (mb += b[i]);
  ma /= n;
  mb /= n;
  let ab = 0, aa = 0, bb = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma, y = b[i] - mb;
    ab += x * y;
    aa += x * x;
    bb += y * y;
  }
  // Quase sem sobe e desce (zumbido, chiado constante): não tem ritmo para comparar.
  const variacao = (m: number, v: number) => (m > 0 ? Math.sqrt(v / n) / m : 0);
  if (variacao(ma, aa) < 0.2 || variacao(mb, bb) < 0.2) return 0;
  return ab / Math.sqrt(aa * bb);
}

export interface EntradaNota {
  /** Áudio original da cena (mono) e a taxa. */
  original: Float32Array;
  taxaOriginal: number;
  /** Trilha de fundo (música e efeitos, sem vozes), se a cena tiver: ajuda a achar só a voz do personagem. */
  fundo?: Float32Array | null;
  taxaFundo?: number;
  /** Sua gravação desta fala (mono) e em que momento da cena ela começa. */
  tomada: Float32Array;
  taxaTomada: number;
  tomadaInicioMs: number;
  /** A fala marcada pelo administrador. */
  inicioMs: number;
  fimMs: number;
}

/** Nota de 0 a 100 (ou null se não deu para medir). */
export function notaDaDublagem(e: EntradaNota): number | null {
  const { inicioMs, fimMs } = e;
  if (fimMs - inicioMs < 200) return null;
  // Personagem: energia do original na fala (menos a trilha de fundo, quando existe).
  let ref = envelope(e.original, e.taxaOriginal, inicioMs, fimMs);
  if (e.fundo && e.taxaFundo) {
    const f = envelope(e.fundo, e.taxaFundo, inicioMs, fimMs);
    ref = ref.map((v, i) => Math.max(0, v - (f[i] ?? 0)));
  }
  // Você: a gravação no mesmo pedaço da cena.
  const minha = envelope(e.tomada, e.taxaTomada, inicioMs - e.tomadaInicioMs, fimMs - e.tomadaInicioMs);
  const n = Math.min(ref.length, minha.length);
  if (n < 5) return null;
  ref = ref.slice(0, n);
  const eu = minha.slice(0, n);
  const pico = Math.max(...eu);
  if (pico < 0.01) return 0; // não falou
  const refAtiva = ativo(ref, 0.3, 0.003);
  const minhaAtiva = ativo(eu, 0.2, 0.008);
  const tol = Math.round(TOLERANCIA_MS / QUADRO_MS);
  const refTem = refAtiva.filter(Boolean).length;
  const minhaTem = minhaAtiva.filter(Boolean).length;
  if (!minhaTem) return 0;

  // 1) Sincronia: você fala quando o personagem fala (e fica quieto quando ele fica).
  let sincronia: number;
  let cobertura = 1;
  if (refTem < 3) {
    // Original sem voz clara (só música alta): mede só se você preencheu a fala.
    sincronia = limitar(minhaTem / n / 0.5);
  } else {
    const refD = dilatar(refAtiva, tol), minhaD = dilatar(minhaAtiva, tol);
    const acertoRef = refAtiva.filter((v, i) => v && minhaD[i]).length / refTem; // cobriu o que o personagem fala
    const acertoMeu = minhaAtiva.filter((v, i) => v && refD[i]).length / minhaTem; // não falou fora de hora
    cobertura = acertoRef;
    const f1 = acertoRef + acertoMeu ? (2 * acertoRef * acertoMeu) / (acertoRef + acertoMeu) : 0;
    sincronia = limitar((f1 - 0.25) / 0.65);
  }
  // 2) Duração parecida com a do personagem.
  const primeiro = (a: boolean[]) => a.indexOf(true);
  const ultimo = (a: boolean[]) => a.lastIndexOf(true);
  const durRef = refTem >= 3 ? ultimo(refAtiva) - primeiro(refAtiva) + 1 : n * 0.7;
  const durMinha = ultimo(minhaAtiva) - primeiro(minhaAtiva) + 1;
  const duracao = limitar((Math.min(durRef, durMinha) / Math.max(durRef, durMinha) - 0.3) / 0.6);
  // 3) Começou na hora: até 150 ms de diferença é perfeito; 800 ms ou mais, zero.
  const atrasoMs = refTem >= 3 ? Math.abs(primeiro(minhaAtiva) - primeiro(refAtiva)) * QUADRO_MS : 0;
  const inicio = limitar(1 - (atrasoMs - TOLERANCIA_MS) / 650);
  // 4) Volume: nem sussurro, nem estourado.
  const volume = pico >= 0.98 ? 0.6 : limitar((pico - 0.02) / 0.13);
  // 5) Ritmo: as sílabas sobem e descem parecido com as do personagem (um zumbido constante não pontua aqui).
  const ritmo = refTem >= 3 ? limitar((correlacao(suavizar(ref), suavizar(eu)) + 0.05) / 0.45) : 0.6;
  const base = 0.35 * sincronia + 0.15 * inicio + 0.15 * duracao + 0.1 * volume + 0.25 * ritmo;
  // Falou só um pedaço do que o personagem fala: a nota cai junto.
  return Math.round(100 * base * (0.5 + 0.5 * limitar(cobertura / 0.85)));
}

export function rotuloDublagem(n: number): string {
  if (n >= 90) return "Dublagem de cinema! 🌟";
  if (n >= 75) return "Muito bem! 🎬";
  if (n >= 55) return "Quase lá! 👍";
  if (n >= 35) return "Dá pra melhorar";
  return "Tente de novo";
}

/** Mistura os canais em mono. */
export function mono(b: AudioBuffer): Float32Array {
  if (b.numberOfChannels === 1) return b.getChannelData(0);
  const out = new Float32Array(b.length);
  for (let c = 0; c < b.numberOfChannels; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < d.length; i++) out[i] += d[i] / b.numberOfChannels;
  }
  return out;
}
