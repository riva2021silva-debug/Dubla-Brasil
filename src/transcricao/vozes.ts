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

/**
 * Quebra uma fala que junta duas falas (ex.: "Oi!" … "Tudo bem?" de pessoas diferentes) nas pausas que o detector de
 * voz encontrou dentro dela. O texto é repartido pelas palavras, na proporção do tempo de cada pedaço.
 */
export function dividirPorPausas(partes: { inicioMs: number; fimMs: number; texto: string; original: string }[], regioes: Trecho[]) {
  const saida: typeof partes = [];
  for (const p of partes) {
    let dentro = regioes
      .map((r) => ({ inicioMs: Math.max(r.inicioMs, p.inicioMs), fimMs: Math.min(r.fimMs, p.fimMs) }))
      .filter((r) => r.fimMs - r.inicioMs >= 250);
    const palavras = p.texto.split(/\s+/).filter(Boolean);
    const originais = p.original.split(/\s+/).filter(Boolean);
    // Só divide se houver pausas de verdade (≥ 250 ms) e palavras suficientes para cada pedaço.
    dentro = dentro.filter((r, i) => i === 0 || r.inicioMs - dentro[i - 1].fimMs >= 0);
    if (dentro.length < 2 || palavras.length < dentro.length) {
      saida.push(p);
      continue;
    }
    const total = dentro.reduce((t, r) => t + (r.fimMs - r.inicioMs), 0);
    const repartir = (lista: string[]) => {
      const pedacos: string[] = [];
      let usadas = 0, acumulado = 0;
      dentro.forEach((r, i) => {
        acumulado += r.fimMs - r.inicioMs;
        const ate = i === dentro.length - 1 ? lista.length : Math.max(usadas + 1, Math.min(lista.length - (dentro.length - 1 - i), Math.round((acumulado / total) * lista.length)));
        pedacos.push(lista.slice(usadas, ate).join(" "));
        usadas = ate;
      });
      return pedacos;
    };
    const textos = repartir(palavras);
    const orig = originais.length >= dentro.length ? repartir(originais) : dentro.map((_, i) => (i === 0 ? p.original : ""));
    // O pedaço começa onde a voz começa e vai até a próxima voz (sem deixar buraco dentro da fala original).
    dentro.forEach((r, i) =>
      saida.push({
        inicioMs: i === 0 ? p.inicioMs : r.inicioMs,
        fimMs: i === dentro.length - 1 ? p.fimMs : r.fimMs,
        texto: textos[i],
        original: orig[i],
      }),
    );
  }
  return saida;
}

export interface FalaTurno {
  personagemId: string;
  inicioMs: number;
  fimMs: number;
  texto: string;
  original?: string;
  id: string;
}

/**
 * Organiza as falas por TURNOS, como numa conversa: o homem fala até terminar, depois a mulher, depois o homem…
 * 1) Pedacinhos seguidos da mesma pessoa (pausa curta) viram uma fala só; frases inteiras ficam separadas.
 * 2) Cada turno vai até o começo do próximo (sem buraco e sem invadir o outro), se o próximo vier logo depois.
 */
export function organizarPorTurnos<T extends FalaTurno>(falas: T[], opcoes = { juntarAteMs: 450, pedacoMs: 1200, esticarAteMs: 2000, folgaMs: 80 }): T[] {
  const ord = [...falas].sort((a, b) => a.inicioMs - b.inicioMs);
  const turnos: T[] = [];
  for (const f of ord) {
    const ult = turnos[turnos.length - 1];
    // Só junta PEDACINHOS da mesma pessoa (ex.: "Iai," + o resto da frase). Frases inteiras ficam separadas,
    // uma fala por frase, mais fáceis de dublar.
    const pedacinho = ult && (ult.fimMs - ult.inicioMs < opcoes.pedacoMs || f.fimMs - f.inicioMs < opcoes.pedacoMs);
    if (ult && pedacinho && ult.personagemId === f.personagemId && f.inicioMs - ult.fimMs <= opcoes.juntarAteMs) {
      turnos[turnos.length - 1] = {
        ...ult,
        fimMs: Math.max(ult.fimMs, f.fimMs),
        texto: [ult.texto, f.texto].filter((t) => t && t !== "…").join(" ") || "…",
        original: [ult.original, f.original].filter(Boolean).join(" ") || undefined,
      };
    } else turnos.push({ ...f });
  }
  for (let i = 0; i < turnos.length - 1; i++) {
    const a = turnos[i], b = turnos[i + 1];
    const espaco = b.inicioMs - a.fimMs;
    // Vai até a próxima pessoa começar (espaço curto) e nunca passa por cima dela.
    if (espaco >= 0 && espaco <= opcoes.esticarAteMs) turnos[i] = { ...a, fimMs: b.inicioMs - opcoes.folgaMs };
    else if (espaco < 0) turnos[i] = { ...a, fimMs: Math.max(a.inicioMs + 300, b.inicioMs - opcoes.folgaMs) };
  }
  return turnos;
}

/**
 * A IA de transcrição às vezes "engasga" em música, grito ou risada e repete a mesma palavra dezenas de vezes
 * ("ah, ah, ah, ah…"). Junta qualquer palavra (ou trecho de até 4 palavras) repetida mais de 3 vezes seguidas
 * em só 3 vezes + "…".
 */
export function limparRepeticoes(texto: string): string {
  const palavras = texto.split(/\s+/).filter(Boolean);
  const norm = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  const saida: string[] = [];
  let i = 0;
  while (i < palavras.length) {
    let pulou = false;
    for (let n = 1; n <= 4 && i + n <= palavras.length; n++) {
      const bloco = palavras.slice(i, i + n).map(norm).join(" ");
      if (!bloco.trim()) continue;
      let rep = 1;
      while (i + (rep + 1) * n <= palavras.length && palavras.slice(i + rep * n, i + (rep + 1) * n).map(norm).join(" ") === bloco) rep++;
      if (rep > 3) {
        const manter = palavras.slice(i, i + 3 * n);
        manter[manter.length - 1] = manter[manter.length - 1].replace(/[,;.!?…]+$/, "") + "…";
        saida.push(...manter);
        i += rep * n;
        pulou = true;
        break;
      }
    }
    if (!pulou) saida.push(palavras[i++]);
  }
  return saida.join(" ");
}
