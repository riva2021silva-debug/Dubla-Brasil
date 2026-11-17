// Gravação do microfone com carimbo de tempo exato (AudioWorklet), para alinhar a voz ao vídeo.

const CODIGO_WORKLET = `
class DublaGravador extends AudioWorkletProcessor {
  constructor() { super(); this.ativo = false;
    this.port.onmessage = (e) => { this.ativo = e.data === "gravar"; }; }
  process(inputs) {
    const canal = inputs[0] && inputs[0][0];
    if (canal && this.ativo) this.port.postMessage({ t: currentTime, d: canal.slice(0) });
    return true;
  }
}
registerProcessor("dubla-gravador", DublaGravador);
`;

const modulosCarregados = new WeakSet<BaseAudioContext>();

export interface Gravacao {
  amostras: Float32Array;
  taxa: number;
  /** Tempo do AudioContext (s) correspondente à primeira amostra. */
  inicioCtx: number;
}

export class Microfone {
  private blocos: Float32Array[] = [];
  private inicioCtx: number | null = null;
  private analisador: AnalyserNode;
  private bufferNivel: Float32Array<ArrayBuffer>;

  private ctx: AudioContext;
  private stream: MediaStream;
  private fonte: MediaStreamAudioSourceNode;
  private no: AudioWorkletNode;

  private constructor(ctx: AudioContext, stream: MediaStream, fonte: MediaStreamAudioSourceNode, no: AudioWorkletNode) {
    this.ctx = ctx;
    this.stream = stream;
    this.fonte = fonte;
    this.no = no;
    this.analisador = ctx.createAnalyser();
    this.analisador.fftSize = 2048;
    this.bufferNivel = new Float32Array(this.analisador.fftSize);
    fonte.connect(this.analisador);
    no.port.onmessage = (e: MessageEvent<{ t: number; d: Float32Array }>) => {
      if (this.inicioCtx === null) this.inicioCtx = e.data.t;
      this.blocos.push(e.data.d);
    };
  }

  static async abrir(
    ctx: AudioContext,
    opcoes: { microfoneId: string; cancelamentoEco: boolean },
  ): Promise<Microfone> {
    if (!navigator.mediaDevices?.getUserMedia)
      throw new Error("Este navegador não permite usar o microfone. Use o Chrome, Edge ou Firefox atualizados.");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: opcoes.microfoneId ? { exact: opcoes.microfoneId } : undefined,
          echoCancellation: opcoes.cancelamentoEco,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
        },
      });
    } catch (e) {
      const nome = (e as DOMException)?.name;
      if (nome === "NotAllowedError")
        throw new Error("Você não permitiu o uso do microfone. Libere o acesso no cadeado da barra de endereço.");
      if (nome === "NotFoundError" || nome === "OverconstrainedError")
        throw new Error("Nenhum microfone encontrado. Conecte um e confira em Configurações.");
      throw e;
    }
    if (!modulosCarregados.has(ctx)) {
      const url = URL.createObjectURL(new Blob([CODIGO_WORKLET], { type: "text/javascript" }));
      await ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      modulosCarregados.add(ctx);
    }
    const fonte = ctx.createMediaStreamSource(stream);
    const no = new AudioWorkletNode(ctx, "dubla-gravador", { numberOfInputs: 1, numberOfOutputs: 1 });
    const mudo = ctx.createGain();
    mudo.gain.value = 0;
    fonte.connect(no).connect(mudo).connect(ctx.destination);
    return new Microfone(ctx, stream, fonte, no);
  }

  iniciar() {
    this.blocos = [];
    this.inicioCtx = null;
    this.no.port.postMessage("gravar");
  }

  parar(): Gravacao | null {
    this.no.port.postMessage("parar");
    if (this.inicioCtx === null || this.blocos.length === 0) return null;
    const total = this.blocos.reduce((s, b) => s + b.length, 0);
    const amostras = new Float32Array(total);
    let pos = 0;
    for (const b of this.blocos) {
      amostras.set(b, pos);
      pos += b.length;
    }
    const g = { amostras, taxa: this.ctx.sampleRate, inicioCtx: this.inicioCtx };
    this.blocos = [];
    this.inicioCtx = null;
    return g;
  }

  /** Nível de entrada atual (0 a 1), para o medidor. */
  nivel(): number {
    this.analisador.getFloatTimeDomainData(this.bufferNivel);
    let pico = 0;
    for (const v of this.bufferNivel) pico = Math.max(pico, Math.abs(v));
    return pico;
  }

  /** Copia o trecho mais recente do microfone (2048 amostras), para detectar o tom em tempo real. */
  lerAmostras(destino: Float32Array<ArrayBuffer>) {
    this.analisador.getFloatTimeDomainData(destino);
  }

  get taxa() {
    return this.ctx.sampleRate;
  }

  nomeDispositivo(): string {
    return this.stream.getAudioTracks()[0]?.label ?? "Microfone";
  }

  fechar() {
    this.no.port.postMessage("parar");
    this.fonte.disconnect();
    this.no.disconnect();
    this.stream.getTracks().forEach((t) => t.stop());
  }
}

/** Recorta [deS, ateS) segundos de uma gravação. */
export function recortar(g: Gravacao, deCtx: number, ateCtx: number): Gravacao {
  const i = Math.max(0, Math.round((deCtx - g.inicioCtx) * g.taxa));
  const f = Math.min(g.amostras.length, Math.round((ateCtx - g.inicioCtx) * g.taxa));
  return { amostras: g.amostras.slice(i, Math.max(i, f)), taxa: g.taxa, inicioCtx: g.inicioCtx + i / g.taxa };
}

export function paraWav(amostras: Float32Array, taxa: number): Blob {
  const dados = new DataView(new ArrayBuffer(44 + amostras.length * 2));
  const txt = (o: number, s: string) => [...s].forEach((c, i) => dados.setUint8(o + i, c.charCodeAt(0)));
  txt(0, "RIFF");
  dados.setUint32(4, 36 + amostras.length * 2, true);
  txt(8, "WAVE");
  txt(12, "fmt ");
  dados.setUint32(16, 16, true);
  dados.setUint16(20, 1, true);
  dados.setUint16(22, 1, true);
  dados.setUint32(24, taxa, true);
  dados.setUint32(28, taxa * 2, true);
  dados.setUint16(32, 2, true);
  dados.setUint16(34, 16, true);
  txt(36, "data");
  dados.setUint32(40, amostras.length * 2, true);
  for (let i = 0; i < amostras.length; i++) {
    const v = Math.max(-1, Math.min(1, amostras[i]));
    dados.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
  }
  return new Blob([dados.buffer], { type: "audio/wav" });
}

export async function listarMicrofones(): Promise<MediaDeviceInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const todos = await navigator.mediaDevices.enumerateDevices();
  return todos.filter((d) => d.kind === "audioinput");
}
