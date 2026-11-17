// Separa automaticamente as falas de um vídeo: transcreve (Whisper), traduz para o português,
// divide falas longas e sugere o personagem de cada fala pelo tom de voz.
import { tomDoQuadro } from "../audio/analise";
import { contextoDeAudio } from "../audio/mixer";
import type { Fala, Personagem } from "../tipos";
import { novoId } from "../util";
import type { Mensagem, Pedido } from "./trabalhador";

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

/** Extrai o áudio do vídeo em mono, 16 kHz (o formato que o Whisper usa). */
async function audioDoVideo(url: string): Promise<Float32Array> {
  const resposta = await fetch(url);
  if (!resposta.ok) throw new Error("Não foi possível ler o vídeo.");
  let decodificado: AudioBuffer;
  try {
    decodificado = await contextoDeAudio().decodeAudioData(await resposta.arrayBuffer());
  } catch {
    throw new Error("Não foi possível ler o áudio deste vídeo. Tente um MP4 comum (H.264 + AAC).");
  }
  const offline = new OfflineAudioContext(1, Math.ceil(decodificado.duration * TAXA), TAXA);
  const fonte = offline.createBufferSource();
  fonte.buffer = decodificado;
  fonte.connect(offline.destination);
  fonte.start();
  return (await offline.startRendering()).getChannelData(0);
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
  const audio = await audioDoVideo(opcoes.urlVideo);
  const copia = audio.slice(); // o original vai para o trabalhador
  const idioma = IDIOMAS_WHISPER[opcoes.idioma] ?? "english";
  const partes = dividirLongas(refinarTempos(copia, await rodarNoTrabalhador({ audio, idioma, modelo: opcoes.modelo ?? "base" }, aoProgredir)));
  if (!partes.length) throw new Error("Não encontrei falas neste vídeo. Ele tem diálogo audível?");

  aoProgredir({ etapa: "personagens", detalhe: "Separando as vozes por personagem…" });
  const grupos = agruparPorVoz(
    partes.map((p) => tomMedio(copia, p.inicioMs, p.fimMs)),
    Math.max(1, Math.min(personagens.length, partes.length)),
  );
  // A primeira voz que aparece vira o primeiro personagem, e assim por diante.
  const ordem: number[] = [];
  for (const g of grupos) if (!ordem.includes(g)) ordem.push(g);
  return partes.map((p, i) => ({
    id: novoId(),
    personagemId: personagens[ordem.indexOf(grupos[i])]?.id ?? personagens[0]?.id ?? "",
    texto: p.texto,
    original: p.original || undefined,
    inicioMs: p.inicioMs,
    fimMs: Math.max(p.inicioMs + 400, p.fimMs),
  }));
}
