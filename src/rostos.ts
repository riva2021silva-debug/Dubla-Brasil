// Rostos dos personagens: encontra o rosto de quem fala no vídeo e recorta uma foto redonda.
// O detector (face-api, modelo "tiny face detector", 190 KB) roda no próprio aparelho e só é
// carregado quando o administrador usa o editor.
import type { Fala, Personagem } from "./tipos";

const TAMANHO = 256;

interface Caixa {
  x: number;
  y: number;
  largura: number;
  altura: number;
  confianca: number;
}

type Detector = (tela: HTMLCanvasElement) => Promise<Caixa[]>;
let detector: Promise<Detector> | null = null;

function carregarDetector(): Promise<Detector> {
  if (detector) return detector;
  detector = (async () => {
    const faceapi = await import("@vladmandic/face-api");
    await (faceapi.tf as unknown as { ready: () => Promise<void> }).ready();
    await faceapi.nets.tinyFaceDetector.loadFromUri(`${import.meta.env.BASE_URL}modelos`);
    const opcoes = new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.45 });
    return async (tela: HTMLCanvasElement) => {
      const achados = await faceapi.detectAllFaces(tela, opcoes);
      return achados.map((d) => ({ x: d.box.x, y: d.box.y, largura: d.box.width, altura: d.box.height, confianca: d.score }));
    };
  })().catch((e) => {
    detector = null;
    throw e;
  });
  return detector;
}

/** Abre o vídeo num elemento invisível, para tirar fotos de quadros específicos. */
function abrirVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.crossOrigin = "anonymous";
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.onloadeddata = () => resolve(v);
    v.onerror = () => reject(new Error("Não foi possível abrir o vídeo para encontrar os rostos."));
    v.src = url;
  });
}

function irPara(v: HTMLVideoElement, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const alvo = Math.min(Math.max(0, ms / 1000), Math.max(0, v.duration - 0.05));
    const pronto = () => {
      v.removeEventListener("seeked", pronto);
      resolve();
    };
    v.addEventListener("seeked", pronto);
    v.currentTime = alvo;
    setTimeout(pronto, 4000);
  });
}

/** Foto do quadro atual do vídeo, em tamanho reduzido (mais rápido para detectar). */
export function fotografar(v: HTMLVideoElement, larguraMax = 640): HTMLCanvasElement {
  const escala = Math.min(1, larguraMax / Math.max(1, v.videoWidth));
  const tela = document.createElement("canvas");
  tela.width = Math.max(1, Math.round(v.videoWidth * escala));
  tela.height = Math.max(1, Math.round(v.videoHeight * escala));
  tela.getContext("2d")!.drawImage(v, 0, 0, tela.width, tela.height);
  return tela;
}

/** Recorta um quadrado em volta do rosto (com folga para cabelo e queixo). Sem rosto, recorta o centro. */
function recortar(tela: HTMLCanvasElement, caixa: Caixa | null): Promise<Blob> {
  let lado: number;
  let cx: number;
  let cy: number;
  if (caixa) {
    lado = Math.max(caixa.largura, caixa.altura) * 1.9;
    cx = caixa.x + caixa.largura / 2;
    cy = caixa.y + caixa.altura / 2 - caixa.altura * 0.08;
  } else {
    lado = Math.min(tela.width, tela.height) * 0.75;
    cx = tela.width / 2;
    cy = tela.height * 0.45;
  }
  lado = Math.min(lado, tela.width, tela.height);
  const x = Math.min(Math.max(0, cx - lado / 2), tela.width - lado);
  const y = Math.min(Math.max(0, cy - lado / 2), tela.height - lado);
  const saida = document.createElement("canvas");
  saida.width = TAMANHO;
  saida.height = TAMANHO;
  saida.getContext("2d")!.drawImage(tela, x, y, lado, lado, 0, 0, TAMANHO, TAMANHO);
  return new Promise((resolve, reject) => saida.toBlob((b) => (b ? resolve(b) : reject(new Error("Falha ao gerar a foto."))), "image/jpeg", 0.88));
}

function melhor(caixas: Caixa[]): Caixa | null {
  // Prefere o rosto maior (quem está em primeiro plano costuma ser quem fala).
  return caixas.reduce<Caixa | null>((m, c) => (!m || c.largura * c.altura * c.confianca > m.largura * m.altura * m.confianca ? c : m), null);
}

/** Usa o quadro que está na tela: procura o rosto nele e recorta. */
export async function rostoDoQuadro(v: HTMLVideoElement): Promise<{ foto: Blob; achouRosto: boolean }> {
  const tela = fotografar(v);
  const caixa = melhor(await (await carregarDetector())(tela));
  return { foto: await recortar(tela, caixa), achouRosto: !!caixa };
}

/** Recorta uma foto enviada pelo administrador num quadrado centralizado (procurando o rosto, se houver). */
export async function rostoDaImagem(arquivo: Blob): Promise<Blob> {
  const url = URL.createObjectURL(arquivo);
  try {
    const img = await new Promise<HTMLImageElement>((ok, erro) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => erro(new Error("Não foi possível abrir essa imagem."));
      i.src = url;
    });
    const escala = Math.min(1, 800 / Math.max(img.width, img.height));
    const tela = document.createElement("canvas");
    tela.width = Math.round(img.width * escala);
    tela.height = Math.round(img.height * escala);
    tela.getContext("2d")!.drawImage(img, 0, 0, tela.width, tela.height);
    const caixa = await carregarDetector()
      .then((d) => d(tela))
      .then(melhor)
      .catch(() => null);
    return recortar(tela, caixa);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Para cada personagem, olha alguns momentos em que ele fala e escolhe o maior rosto encontrado.
 * Devolve a foto de cada personagem (ou um recorte do centro do vídeo quando nenhum rosto aparece).
 */
export async function gerarRostos(
  urlVideo: string,
  personagens: Personagem[],
  falas: Fala[],
  aoProgredir?: (feitos: number, total: number) => void,
): Promise<Record<string, { foto: Blob; achouRosto: boolean }>> {
  const detectar = await carregarDetector();
  const v = await abrirVideo(urlVideo);
  const saida: Record<string, { foto: Blob; achouRosto: boolean }> = {};
  try {
    let feitos = 0;
    for (const p of personagens) {
      const dele = falas.filter((f) => f.personagemId === p.id).sort((a, b) => b.fimMs - b.inicioMs - (a.fimMs - a.inicioMs)).slice(0, 4);
      let escolhido: { tela: HTMLCanvasElement; caixa: Caixa; nota: number } | null = null;
      let reserva: HTMLCanvasElement | null = null;
      for (const f of dele) {
        for (const fracao of [0.35, 0.65]) {
          await irPara(v, f.inicioMs + (f.fimMs - f.inicioMs) * fracao);
          const tela = fotografar(v);
          reserva ??= tela;
          const caixa = melhor(await detectar(tela));
          if (!caixa) continue;
          const nota = caixa.largura * caixa.altura * caixa.confianca;
          if (!escolhido || nota > escolhido.nota) escolhido = { tela, caixa, nota };
        }
      }
      if (escolhido) saida[p.id] = { foto: await recortar(escolhido.tela, escolhido.caixa), achouRosto: true };
      else if (reserva) saida[p.id] = { foto: await recortar(reserva, null), achouRosto: false };
      aoProgredir?.(++feitos, personagens.length);
    }
  } finally {
    v.removeAttribute("src");
    v.load();
  }
  return saida;
}
