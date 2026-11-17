// Câmera frontal: prévia ao vivo e gravação de vídeo (sem som; a voz é gravada à parte pelo microfone).

function formato(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  // H.264 primeiro: o celular grava e toca com o chip de vídeo (leve). VP9 só em último caso (pesado para tocar).
  return ["video/mp4;codecs=avc1.42E01E", "video/mp4", "video/webm;codecs=vp8", "video/webm", "video/webm;codecs=vp9"].find((m) => MediaRecorder.isTypeSupported(m));
}

export class Camera {
  readonly stream: MediaStream;
  private gravador: MediaRecorder | null = null;
  private partes: Blob[] = [];

  private constructor(stream: MediaStream) {
    this.stream = stream;
  }

  static async abrir(): Promise<Camera> {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Este aparelho não permite usar a câmera.");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 360 }, height: { ideal: 360 }, frameRate: { ideal: 24, max: 24 } },
        audio: false,
      });
      return new Camera(stream);
    } catch (e) {
      const nome = (e as DOMException)?.name;
      if (nome === "NotAllowedError") throw new Error("Você não permitiu o uso da câmera. Libere o acesso nas permissões do app.");
      if (nome === "NotFoundError" || nome === "OverconstrainedError") throw new Error("Nenhuma câmera frontal encontrada.");
      throw e;
    }
  }

  iniciar() {
    const mime = formato();
    if (!mime) throw new Error("Este aparelho não consegue gravar vídeo da câmera.");
    this.partes = [];
    this.gravador = new MediaRecorder(this.stream, { mimeType: mime, videoBitsPerSecond: 600_000 });
    this.gravador.ondataavailable = (e) => e.data.size && this.partes.push(e.data);
    this.gravador.start(500);
  }

  /** Para a gravação e devolve o vídeo (ou null se nada foi gravado). */
  parar(): Promise<Blob | null> {
    const g = this.gravador;
    this.gravador = null;
    if (!g || g.state === "inactive") return Promise.resolve(null);
    return new Promise((resolve) => {
      g.onstop = () => resolve(this.partes.length ? new Blob(this.partes, { type: g.mimeType.split(";")[0] }) : null);
      g.stop();
    });
  }

  gravando() {
    return this.gravador?.state === "recording";
  }

  fechar() {
    if (this.gravador && this.gravador.state !== "inactive") this.gravador.stop();
    this.stream.getTracks().forEach((t) => t.stop());
  }
}

/** Qual trecho da câmera está passando neste instante da cena (o mais recente vence). */
export function trechoNoTempo<T extends { inicioMs: number; duracaoMs: number }>(trechos: T[] | undefined, ms: number): T | undefined {
  if (!trechos) return undefined;
  for (let i = trechos.length - 1; i >= 0; i--) {
    const t = trechos[i];
    if (ms >= t.inicioMs && ms < t.inicioMs + t.duracaoMs) return t;
  }
  return undefined;
}
