// Separa automaticamente as falas de um vídeo: transcreve (Whisper), traduz para o português,
// divide falas longas e sugere o personagem de cada fala pelo tom de voz.
import { tomDoQuadro } from "../audio/analise";
import { contextoDeAudio } from "../audio/mixer";
import type { Fala, Personagem } from "../tipos";
import { novoId } from "../util";
import type { Mensagem, Pedido } from "./trabalhador";
import { audioEstereo, detectarFala, dividirPorPausas, organizarPorTurnos, trechosSemFala, type Trecho } from "./vozes";

const TAXA = 16000;
const MAX_FALA_MS = 7000;

/** Nome do idioma no editor -> nome que o Whisper entende. */
const IDIOMAS_WHISPER: Record<string, string> = {
  "Português (Brasil)": "portuguese",
  "Português (Portugal)": "portuguese",
  Inglês: "english",
  Espanhol: "spanish",
  Francês: "french",
  Italiano: "italian",
  Alemão: "german",
  Japonês: "japanese",
  Coreano: "korean",
};

export interface Progresso {
  etapa: "preparando" | "baixando" | "ouvindo" | "traduzindo" | "personagens";
  detalhe: string;
  fracao?: number;
}

/** Extrai o áudio do vídeo a 16 kHz: em mono (o formato que o Whisper usa) e em estéreo (para o detector de voz). */
async function audioDoVideo(url: string): Promise<{ mono: Float32Array; esq: Float32Array; dir: Float32Array }> {
  const resposta = await fetch(url);
  if (!resposta.ok) throw new Error("Não foi possível ler o vídeo.");
  let e: { esq: Float32Array; dir: Float32Array };
  try {
    e = await audioEstereo(await resposta.arrayBuffer(), contextoDeAudio());
  } catch {
    throw new Error("Não foi possível ler o áudio deste vídeo. Tente um MP4 comum (H.264 + AAC).");
  }
  const mono = new Float32Array(e.esq.length);
  for (let i = 0; i < mono.length; i++) mono[i] = (e.esq[i] + e.dir[i]) / 2;
  return { mono, ...e };
}

function rodarNoTrabalhador(pedido: Pedido, aoProgredir: (p: Progresso) => void) {
  return new Promise<{ inicioMs: number; fimMs: number; texto: string; original: string }[]>((resolve, reject) => {
    const w = new Worker(new URL("./trabalhador.ts", import.meta.url), { type: "module" });
    w.onmessage = (e: MessageEvent<Mensagem>) => {
      const m = e.data;
      if (m.tipo === "progresso") aoProgredir({ etapa: m.etapa, detalhe: m.detalhe, fracao: m.fracao });
      else {
        w.terminate();
        if (m.tipo === "pronto") resolve(m.partes);
        else reject(new Error(/fetch|network|Failed to fetch|NetworkError/i.test(m.mensagem) ? "Sem internet para baixar o modelo de fala. Conecte-se e tente de novo." : m.mensagem));
      }
    };
    w.onerror = (e) => {
      w.terminate();
      reject(new Error(e.message || "O processamento parou. Tente de novo."));
    };
    w.postMessage(pedido, [pedido.audio.buffer]);
  });
}

/** Quebra falas muito longas nas pontuações, dividindo o tempo pela quantidade de texto. */
function dividirLongas(partes: { inicioMs: number; fimMs: number; texto: string; original: string }[]) {
  const saida: typeof partes = [];
  for (const p of partes) {
    const dur = p.fimMs - p.inicioMs;
    const frases = p.texto.match(/[^.!?…]+[.!?…]*\s*/g)?.map((f) => f.trim()).filter(Boolean) ?? [p.texto];
    if (dur <= MAX_FALA_MS || frases.length < 2) {
      saida.push(p);
      continue;
    }
    // Junta frases em blocos de até ~7 s.
    const total = frases.reduce((s, f) => s + f.length, 0);
    let ini = p.inicioMs;
    let bloco: string[] = [];
    let blocoChars = 0;
    frases.forEach((f, i) => {
      bloco.push(f);
      blocoChars += f.length;
      const blocoMs = (blocoChars / total) * dur;
      const ultimo = i === frases.length - 1;
      if (ultimo || blocoMs >= MAX_FALA_MS * 0.6) {
        const fim = ultimo ? p.fimMs : Math.round(ini + blocoMs);
        saida.push({ inicioMs: ini, fimMs: fim, texto: bloco.join(" "), original: saida.length === 0 || ultimo ? p.original : "" });
        ini = fim;
        bloco = [];
        blocoChars = 0;
      }
    });
  }
  return saida;
}

/**
 * Ajusta o início e o fim de cada fala pelo volume da voz: o Whisper às vezes devolve tempos
 * arredondados (de segundo em segundo), então procuramos onde a fala realmente começa e termina.
 */
function refinarTempos(audio: Float32Array, partes: { inicioMs: number; fimMs: number; texto: string; original: string }[]) {
  const passo = Math.round(TAXA * 0.02); // quadros de 20 ms
  const energia = new Float32Array(Math.ceil(audio.length / passo));
  for (let q = 0; q < energia.length; q++) {
    let soma = 0;
    const ini = q * passo;
    const fim = Math.min(audio.length, ini + passo);
    for (let i = ini; i < fim; i++) soma += audio[i] * audio[i];
    energia[q] = Math.sqrt(soma / Math.max(1, fim - ini));
  }
  const q = (ms: number) => Math.max(0, Math.min(energia.length - 1, Math.round(ms / 20)));
  const saida = partes.map((p) => ({ ...p }));
  saida.forEach((p, i) => {
    // Não invade as falas vizinhas: a fronteira indicada pelo Whisper entre duas falas fica no silêncio entre elas.
    const limiteAntes = i > 0 ? Math.max(saida[i - 1].fimMs, partes[i - 1].fimMs) : 0;
    const limiteDepois = i < saida.length - 1 ? partes[i + 1].inicioMs : audio.length / (TAXA / 1000);
    const a = q(Math.max(limiteAntes, p.inicioMs - 600));
    const b = q(Math.min(limiteDepois, p.fimMs + 600));
    let pico = 0;
    for (let k = a; k <= b; k++) pico = Math.max(pico, energia[k]);
    if (pico < 0.01) return; // trecho sem voz clara: mantém o que o Whisper disse
    const limiar = pico * 0.12;
    // Começo: primeira subida de volume perto do início indicado. Fim: última, perto do fim indicado.
    let ini = -1;
    for (let k = a; k <= q(p.fimMs); k++)
      if (energia[k] > limiar) {
        ini = k;
        break;
      }
    let fim = -1;
    for (let k = b; k >= q(p.inicioMs); k--)
      if (energia[k] > limiar) {
        fim = k;
        break;
      }
    if (ini < 0 || fim <= ini) return;
    p.inicioMs = Math.max(limiteAntes, ini * 20 - 80);
    p.fimMs = Math.min(limiteDepois, (fim + 1) * 20 + 120);
  });
  return saida;
}

/** Tom médio (Hz) de um trecho, ou null se não houver voz clara. */
function tomMedio(audio: Float32Array, inicioMs: number, fimMs: number): number | null {
  const a = Math.max(0, Math.floor((inicioMs / 1000) * TAXA));
  const b = Math.min(audio.length, Math.floor((fimMs / 1000) * TAXA));
  const tons: number[] = [];
  const quadro = new Float32Array(1024);
  for (let i = a; i + 1024 <= b; i += 320) {
    quadro.set(audio.subarray(i, i + 1024));
    const f = tomDoQuadro(quadro, TAXA, 70, 450);
    if (f) tons.push(f);
  }
  if (tons.length < 3) return null;
  tons.sort((x, y) => x - y);
  return tons[Math.floor(tons.length / 2)];
}

/** Agrupa as falas em `k` vozes pelo tom (k-means em escala de semitons). */
function agruparPorVoz(tons: (number | null)[], k: number): number[] {
  const validos = tons.filter((t): t is number => t !== null).map((t) => 12 * Math.log2(t));
  if (k <= 1 || validos.length < 2) return tons.map(() => 0);
  const ordenados = [...validos].sort((a, b) => a - b);
  let centros = Array.from({ length: k }, (_, i) => ordenados[Math.floor(((i + 0.5) / k) * ordenados.length)]);
  const grupoDe = (v: number) => centros.reduce((m, c, i) => (Math.abs(v - c) < Math.abs(v - centros[m]) ? i : m), 0);
  for (let it = 0; it < 20; it++) {
    const somas = centros.map(() => ({ s: 0, n: 0 }));
    for (const v of validos) {
      const g = grupoDe(v);
      somas[g].s += v;
      somas[g].n++;
    }
    centros = centros.map((c, i) => (somas[i].n ? somas[i].s / somas[i].n : c));
  }
  let anterior = 0;
  return tons.map((t) => {
    if (t === null) return anterior; // sem voz clara: mantém quem falava antes
    anterior = grupoDe(12 * Math.log2(t));
    return anterior;
  });
}

export async function separarFalas(opcoes: {
  urlVideo: string;
  idioma: string;
  personagens: Personagem[];
  modelo?: "base" | "tiny";
  aoProgredir: (p: Progresso) => void;
}): Promise<Fala[]> {
  const { aoProgredir, personagens } = opcoes;
  aoProgredir({ etapa: "preparando", detalhe: "Lendo o áudio do vídeo…" });
  const som = await audioDoVideo(opcoes.urlVideo);
  const audio = som.mono;
  const copia = audio.slice(); // o original vai para o trabalhador
  const idioma = IDIOMAS_WHISPER[opcoes.idioma] ?? "english";
  const regioes = detectarFala(som.esq, som.dir, TAXA);
  const partes = dividirLongas(dividirPorPausas(refinarTempos(copia, await rodarNoTrabalhador({ audio, idioma, modelo: opcoes.modelo ?? "base" }, aoProgredir)), regioes));
  if (!partes.length) throw new Error("Não encontrei falas neste vídeo. Ele tem diálogo audível?");

  aoProgredir({ etapa: "personagens", detalhe: "Separando as vozes por personagem…" });
  const grupos = agruparPorVoz(
    partes.map((p) => tomMedio(copia, p.inicioMs, p.fimMs)),
    Math.max(1, Math.min(personagens.length, partes.length)),
  );
  // A primeira voz que aparece vira o primeiro personagem, e assim por diante.
  const ordem: number[] = [];
  for (const g of grupos) if (!ordem.includes(g)) ordem.push(g);
  const falas: Fala[] = partes.map((p, i) => ({
    id: novoId(),
    personagemId: personagens[ordem.indexOf(grupos[i])]?.id ?? personagens[0]?.id ?? "",
    texto: p.texto,
    original: p.original || undefined,
    inicioMs: p.inicioMs,
    fimMs: Math.max(p.inicioMs + 400, p.fimMs),
  }));
  // O Whisper às vezes pula falas curtas ou rápidas: o detector de voz acha esses buracos e completa.
  const extras = await completarBuracos({ som, copia, falas, personagens, idioma, modelo: opcoes.modelo ?? "base", aoProgredir });
  // Por turnos: cada pessoa fala até terminar e o turno vai até a próxima pessoa começar.
  return organizarPorTurnos([...falas, ...extras]);
}

/** Acha trechos com voz sem fala marcada, transcreve só eles e escolhe o personagem pelo tom de voz. */
async function completarBuracos(o: {
  som: { esq: Float32Array; dir: Float32Array };
  copia: Float32Array;
  falas: Fala[];
  personagens: Personagem[];
  idioma: string;
  modelo: "base" | "tiny";
  aoProgredir: (p: Progresso) => void;
}): Promise<Fala[]> {
  const buracos = trechosSemFala(detectarFala(o.som.esq, o.som.dir, TAXA), o.falas);
  if (!buracos.length) return [];
  o.aoProgredir({ etapa: "ouvindo", detalhe: `Encontrei ${buracos.length} ${buracos.length === 1 ? "trecho falado sem fala marcada" : "trechos falados sem fala marcada"}. Ouvindo…` });
  // Junta os trechos num áudio só (com 1 s de silêncio entre eles) para ouvir tudo de uma vez.
  const MARGEM = 0.2 * TAXA, ESPACO = 1 * TAXA;
  const pedacos = buracos.map((b) => {
    const a = Math.max(0, Math.floor((b.inicioMs / 1000) * TAXA - MARGEM));
    const z = Math.min(o.copia.length, Math.ceil((b.fimMs / 1000) * TAXA + MARGEM));
    return { b, a, z };
  });
  const tamanho = pedacos.reduce((t, p) => t + (p.z - p.a) + ESPACO, 0);
  const junto = new Float32Array(tamanho);
  const posicoes: { b: Trecho; de: number; ate: number }[] = [];
  let pos = 0;
  for (const p of pedacos) {
    junto.set(o.copia.subarray(p.a, p.z), pos);
    posicoes.push({ b: p.b, de: (pos / TAXA) * 1000, ate: ((pos + p.z - p.a) / TAXA) * 1000 });
    pos += p.z - p.a + ESPACO;
  }
  let textos: { texto: string; original: string }[] = buracos.map(() => ({ texto: "", original: "" }));
  try {
    const ouvidas = await rodarNoTrabalhador({ audio: junto, idioma: o.idioma, modelo: o.modelo }, o.aoProgredir);
    textos = posicoes.map((p) => {
      const daqui = ouvidas.filter((x) => (x.inicioMs + x.fimMs) / 2 >= p.de - 300 && (x.inicioMs + x.fimMs) / 2 <= p.ate + 300);
      return { texto: daqui.map((x) => x.texto).join(" ").trim(), original: daqui.map((x) => x.original).join(" ").trim() };
    });
  } catch {
    /* sem texto: as falas entram com "…" para o administrador completar */
  }
  // Tom de voz típico de cada personagem (pelas falas que já têm).
  const tons = new Map<string, number[]>();
  for (const f of o.falas) {
    const t = tomMedio(o.copia, f.inicioMs, f.fimMs);
    if (t) tons.set(f.personagemId, [...(tons.get(f.personagemId) ?? []), 12 * Math.log2(t)]);
  }
  const tipico = [...tons].map(([pid, v]) => ({ pid, st: [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)] }));
  return buracos.map((b, i) => {
    const t = tomMedio(o.copia, b.inicioMs, b.fimMs);
    let pid = o.personagens[0]?.id ?? "";
    if (t && tipico.length) {
      const st = 12 * Math.log2(t);
      pid = tipico.reduce((m, x) => (Math.abs(x.st - st) < Math.abs(m.st - st) ? x : m)).pid;
    } else {
      const antes = [...o.falas].filter((f) => f.fimMs <= b.inicioMs).sort((a, c) => c.fimMs - a.fimMs)[0];
      if (antes) pid = antes.personagemId;
    }
    return {
      id: novoId(),
      personagemId: pid,
      texto: textos[i].texto || "…",
      original: textos[i].original || undefined,
      inicioMs: b.inicioMs,
      fimMs: b.fimMs,
    };
  });
}

/** Tom típico (semitons) de cada personagem, pelas falas que já têm. */
function tonsPorPersonagem(audio: Float32Array, falas: Fala[]) {
  const tons = new Map<string, number[]>();
  for (const f of falas) {
    const t = tomMedio(audio, f.inicioMs, f.fimMs);
    if (t) tons.set(f.personagemId, [...(tons.get(f.personagemId) ?? []), 12 * Math.log2(t)]);
  }
  return [...tons].map(([pid, v]) => ({ pid, st: [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)] }));
}

/**
 * Para o editor: arruma as falas que já existem, sem refazer tudo.
 * 1) Divide as falas que juntam duas vozes (com pausa no meio) e escolhe o personagem de cada pedaço pelo tom.
 * 2) Completa os trechos falados que ficaram sem fala.
 */
export async function arrumarFalas(opcoes: {
  urlVideo: string;
  idioma: string;
  falas: Fala[];
  personagens: Personagem[];
  modelo?: "base" | "tiny";
  aoProgredir: (p: Progresso) => void;
}): Promise<{ falas: Fala[]; divididas: number; novas: Fala[] }> {
  opcoes.aoProgredir({ etapa: "preparando", detalhe: "Ouvindo as vozes da cena…" });
  const som = await audioDoVideo(opcoes.urlVideo);
  const regioes = detectarFala(som.esq, som.dir, TAXA);
  const tipico = tonsPorPersonagem(som.mono, opcoes.falas);
  let divididas = 0;
  const arrumadas: Fala[] = [];
  for (const f of [...opcoes.falas].sort((a, b) => a.inicioMs - b.inicioMs)) {
    const pedacos = dividirPorPausas([{ inicioMs: f.inicioMs, fimMs: f.fimMs, texto: f.texto, original: f.original ?? "" }], regioes);
    if (pedacos.length < 2) {
      arrumadas.push(f);
      continue;
    }
    divididas++;
    pedacos.forEach((p, i) => {
      const t = tomMedio(som.mono, p.inicioMs, p.fimMs);
      let pid = f.personagemId;
      if (t && tipico.length > 1) {
        const st = 12 * Math.log2(t);
        pid = tipico.reduce((m, x) => (Math.abs(x.st - st) < Math.abs(m.st - st) ? x : m)).pid;
      }
      arrumadas.push({ ...f, id: i === 0 ? f.id : novoId(), personagemId: pid, texto: p.texto, original: p.original || undefined, inicioMs: p.inicioMs, fimMs: p.fimMs });
    });
  }
  const novas = await completarBuracos({
    som,
    copia: som.mono,
    falas: arrumadas,
    personagens: opcoes.personagens,
    idioma: IDIOMAS_WHISPER[opcoes.idioma] ?? "english",
    modelo: opcoes.modelo ?? "base",
    aoProgredir: opcoes.aoProgredir,
  });
  return { falas: organizarPorTurnos([...arrumadas, ...novas]), divididas, novas };
}

/** Para o editor: procura falas que ficaram de fora (sem refazer as que já existem). */
export async function encontrarFalasQueFaltaram(opcoes: {
  urlVideo: string;
  idioma: string;
  falas: Fala[];
  personagens: Personagem[];
  modelo?: "base" | "tiny";
  aoProgredir: (p: Progresso) => void;
}): Promise<Fala[]> {
  opcoes.aoProgredir({ etapa: "preparando", detalhe: "Procurando trechos com voz sem fala marcada…" });
  const som = await audioDoVideo(opcoes.urlVideo);
  return completarBuracos({
    som,
    copia: som.mono,
    falas: opcoes.falas,
    personagens: opcoes.personagens,
    idioma: IDIOMAS_WHISPER[opcoes.idioma] ?? "english",
    modelo: opcoes.modelo ?? "base",
    aoProgredir: opcoes.aoProgredir,
  });
}
