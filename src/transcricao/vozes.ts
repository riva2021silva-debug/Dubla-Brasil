// Detector de voz: acha os trechos em que alguém está falando no vídeo, para não sobrar "buraco" sem fala marcada
// (no buraco a voz original voltaria no meio da dublagem). Em filmes, séries e desenhos a voz fica no CENTRO do
// estéreo (igual nos dois lados) e a música/ambiente fica espalhada; então "fala" = som forte no centro e mais forte
// que nos lados. Em vídeo mono, usa só a força do som.

export interface Trecho {
  inicioMs: number;
  fimMs: number;
}

const QUADRO_MS = 20;

/** Lê o áudio do vídeo em estéreo, 16 kHz. */
export async function audioEstereo(dados: ArrayBuffer, ctx: BaseAudioContext): Promise<{ esq: Float32Array; dir: Float32Array; taxa: number }> {
  const buf = await ctx.decodeAudioData(dados);
  const taxa = 16000;
  const off = new OfflineAudioContext(2, Math.ceil(buf.duration * taxa), taxa);
  const f = off.createBufferSource();
  f.buffer = buf;
  f.connect(off.destination);
  f.start();
  const r = await off.startRendering();
  return { esq: r.getChannelData(0), dir: r.getChannelData(r.numberOfChannels > 1 ? 1 : 0), taxa };
}

function percentil(v: Float32Array | number[], p: number) {
  const o = Array.from(v).sort((a, b) => a - b);
  return o[Math.min(o.length - 1, Math.max(0, Math.floor(p * (o.length - 1))))] ?? 0;
}

/** Filtro de 2ª ordem (RBJ) aplicado no lugar. */
function filtrar(x: Float32Array, taxa: number, tipo: "passa-altas" | "passa-baixas", freq: number) {
  const w = (2 * Math.PI * freq) / taxa, cw = Math.cos(w), al = Math.sin(w) / (2 * 0.707);
  const b0 = tipo === "passa-altas" ? (1 + cw) / 2 : (1 - cw) / 2;
  const b1 = tipo === "passa-altas" ? -(1 + cw) : 1 - cw;
  const a0 = 1 + al, a1 = -2 * cw, a2 = 1 - al;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const y = (b0 * x[i] + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1;
    x1 = x[i];
    y2 = y1;
    y1 = y;
    x[i] = y;
  }
}

/** Trechos com fala (em ms). */
export function detectarFala(esqOriginal: Float32Array, dirOriginal: Float32Array, taxa: number): Trecho[] {
  const n = Math.floor((QUADRO_MS / 1000) * taxa);
  const total = Math.floor(esqOriginal.length / n);
  // Só a faixa da voz humana (250 Hz a 3,5 kHz): tira batidas graves e chiados agudos.
  const centro = new Float32Array(esqOriginal.length);
  const lados = new Float32Array(esqOriginal.length);
  for (let i = 0; i < centro.length; i++) {
    centro[i] = (esqOriginal[i] + dirOriginal[i]) / 2;
    lados[i] = (esqOriginal[i] - dirOriginal[i]) / 2;
  }
  for (const s of [centro, lados]) {
    filtrar(s, taxa, "passa-altas", 250);
    filtrar(s, taxa, "passa-baixas", 3500);
  }
  const eCentro = new Float32Array(total);
  const eLados = new Float32Array(total);
  for (let q = 0; q < total; q++) {
    let c = 0, l = 0;
    for (let i = q * n; i < (q + 1) * n; i++) {
      c += centro[i] * centro[i];
      l += lados[i] * lados[i];
    }
    eCentro[q] = 10 * Math.log10(c / n + 1e-12);
    eLados[q] = 10 * Math.log10(l / n + 1e-12);
  }
  // Vídeo praticamente mono: os lados são quase silêncio o tempo todo.
  const diferenca = Array.from(eCentro, (c, i) => c - eLados[i]);
  const diferencaTipica = percentil(diferenca, 0.3);
  const mono = percentil(diferenca, 0.5) > 25;
  const piso = percentil(eCentro, 0.2);
  const topo = percentil(eCentro, 0.95);
  const fala = new Uint8Array(total);
  for (let q = 0; q < total; q++) {
    fala[q] = mono
      ? eCentro[q] > Math.max(piso + 9, topo - 30) ? 1 : 0
      : // Estéreo: a voz levanta o centro bem acima dos lados (música e ambiente sobem os dois juntos).
        diferenca[q] > diferencaTipica + 3 && eCentro[q] > piso + 1.5 && eCentro[q] > topo - 40 ? 1 : 0;
  }

  // Junta pedacinhos: buracos < 300 ms viram fala; falas < 300 ms somem.
  const juntar = (valor: 0 | 1, maxQuadros: number) => {
    let i = 0;
    while (i < total) {
      if (fala[i] !== valor) {
        i++;
        continue;
      }
      let j = i;
      while (j < total && fala[j] === valor) j++;
      if (j - i < maxQuadros && i > 0 && j < total) fala.fill(valor ? 0 : 1, i, j);
      i = j;
    }
  };
  juntar(0, 300 / QUADRO_MS);
  juntar(1, 300 / QUADRO_MS);

  const trechos: Trecho[] = [];
  for (let i = 0; i < total; ) {
    if (!fala[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j < total && fala[j]) j++;
    // Pequena margem: o começo e o fim da fala são mais fracos que o meio.
    trechos.push({ inicioMs: Math.max(0, i * QUADRO_MS - 80), fimMs: j * QUADRO_MS + 80 });
    i = j;
  }
  return trechos;
}

/** Partes dos trechos com fala que não estão em nenhuma fala marcada (com folga), de pelo menos `minimoMs`. */
export function trechosSemFala(fala: Trecho[], marcadas: Trecho[], minimoMs = 300, folgaMs = 150): Trecho[] {
  const cobertas = marcadas.map((f) => ({ inicioMs: f.inicioMs - folgaMs, fimMs: f.fimMs + folgaMs })).sort((a, b) => a.inicioMs - b.inicioMs);
  const saida: Trecho[] = [];
  for (const t of fala) {
    let pedacos: Trecho[] = [t];
    for (const c of cobertas) {
      pedacos = pedacos.flatMap((p) => {
        if (c.fimMs <= p.inicioMs || c.inicioMs >= p.fimMs) return [p];
        const r: Trecho[] = [];
        if (c.inicioMs > p.inicioMs) r.push({ inicioMs: p.inicioMs, fimMs: c.inicioMs });
        if (c.fimMs < p.fimMs) r.push({ inicioMs: c.fimMs, fimMs: p.fimMs });
        return r;
      });
    }
    saida.push(...pedacos.filter((p) => p.fimMs - p.inicioMs >= minimoMs));
  }
  return saida;
}
