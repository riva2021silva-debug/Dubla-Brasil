// Fotografar quadros de um vídeo de forma confiável (no Android, o quadro às vezes sai preto se a
// foto é tirada logo depois de pular para um instante, antes de a imagem ser decodificada).

export function abrirVideoOculto(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.crossOrigin = "anonymous";
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    const desistir = setTimeout(() => reject(new Error("O vídeo demorou demais para abrir.")), 20000);
    v.onloadeddata = () => {
      clearTimeout(desistir);
      resolve(v);
    };
    v.onerror = () => {
      clearTimeout(desistir);
      reject(new Error("Não foi possível abrir o vídeo."));
    };
    v.src = url;
  });
}

function esperarQuadroDesenhado(v: HTMLVideoElement): Promise<void> {
  return new Promise((resolve) => {
    const fim = setTimeout(resolve, 700);
    const comCallback = v as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number };
    if (comCallback.requestVideoFrameCallback)
      comCallback.requestVideoFrameCallback(() => {
        clearTimeout(fim);
        resolve();
      });
  });
}

export async function irParaQuadro(v: HTMLVideoElement, ms: number): Promise<void> {
  const alvo = Math.min(Math.max(0, ms / 1000), Math.max(0, (v.duration || 0) - 0.05));
  await new Promise<void>((resolve) => {
    const pronto = () => {
      v.removeEventListener("seeked", pronto);
      resolve();
    };
    v.addEventListener("seeked", pronto);
    v.currentTime = alvo;
    setTimeout(pronto, 4000);
  });
  await esperarQuadroDesenhado(v);
}

export function fotografar(v: HTMLVideoElement, larguraMax = 640): HTMLCanvasElement {
  const escala = Math.min(1, larguraMax / Math.max(1, v.videoWidth));
  const tela = document.createElement("canvas");
  tela.width = Math.max(1, Math.round(v.videoWidth * escala));
  tela.height = Math.max(1, Math.round(v.videoHeight * escala));
  tela.getContext("2d", { willReadFrequently: true })!.drawImage(v, 0, 0, tela.width, tela.height);
  return tela;
}

/** Quadro quase todo preto (vídeo ainda não desenhado, ou cena escura demais para virar foto). */
export function quadroEscuro(tela: HTMLCanvasElement): boolean {
  const g = tela.getContext("2d", { willReadFrequently: true })!;
  const { data } = g.getImageData(0, 0, tela.width, tela.height);
  let soma = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += 4 * 37) {
    soma += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    n++;
  }
  return soma / Math.max(1, n) < 14;
}

/**
 * Foto de um instante do vídeo, sem quadro preto: se sair escuro, tenta de novo
 * (primeiro tocando um instante para o aparelho decodificar, depois um pouco mais à frente).
 */
export async function fotoBoa(v: HTMLVideoElement, ms: number, larguraMax = 640): Promise<HTMLCanvasElement> {
  let ultima: HTMLCanvasElement | null = null;
  for (const desvio of [0, 0, 400, 900, -500]) {
    await irParaQuadro(v, ms + desvio);
    if (ultima && desvio === 0) {
      // Segunda tentativa no mesmo ponto: toca rapidinho para forçar a decodificação da imagem.
      await v.play().catch(() => {});
      await new Promise((r) => setTimeout(r, 120));
      v.pause();
      await irParaQuadro(v, ms);
    }
    const tela = fotografar(v, larguraMax);
    if (!quadroEscuro(tela)) return tela;
    ultima = tela;
  }
  return ultima!;
}

export function telaParaJpeg(tela: HTMLCanvasElement, qualidade = 0.85): Promise<Blob> {
  return new Promise((resolve, reject) => tela.toBlob((b) => (b ? resolve(b) : reject(new Error("Falha ao gerar a imagem."))), "image/jpeg", qualidade));
}
