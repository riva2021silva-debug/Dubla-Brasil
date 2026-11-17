// Mixer: toca o vídeo, a trilha de fundo e as suas tomadas em sincronia.
//
// Regra de mixagem:
//  - Fora das suas falas, toca o áudio original do vídeo (música + vozes dos outros personagens).
//  - Durante as suas falas, o original é silenciado e entra a trilha de fundo (música sem vozes),
//    com a sua voz por cima. Sem trilha de fundo, o original fica no volume configurado.

export interface Janela {
  inicioMs: number;
  fimMs: number;
}

export interface TomadaTocavel {
  falaId: string;
  buffer: AudioBuffer;
  inicioMs: number;
}

const FOLGA_ANTES_MS = 120;
const FOLGA_DEPOIS_MS = 300;
const SUAVIZACAO_S = 0.02;

let contextoCompartilhado: AudioContext | null = null;
export function contextoDeAudio(): AudioContext {
  if (!contextoCompartilhado) contextoCompartilhado = new AudioContext({ latencyHint: "interactive" });
  return contextoCompartilhado;
}

const fontesDeVideo = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();

export class Mixer {
  readonly ctx: AudioContext;
  private ganhoVideo: GainNode;
  private ganhoFundo: GainNode;
  private ganhoVoz: GainNode;
  readonly saida: GainNode;
  private fundo: AudioBuffer | null = null;
  private tomadas: TomadaTocavel[] = [];
  private janelas: Janela[] = [];
  private ativas: AudioBufferSourceNode[] = [];
  private ancora: { ctx: number; cenaMs: number } | null = null;
  private ignorar = new Set<string>();
  /** Toca a cena como ela é: sem silenciar o original e sem as suas tomadas. */
  private modoOriginal = false;
  volumeOriginalNaMinhaFala = 0;
  private limpar: () => void;

  private video: HTMLVideoElement;

  constructor(video: HTMLVideoElement) {
    this.video = video;
    this.ctx = contextoDeAudio();
    let fonte = fontesDeVideo.get(video);
    if (!fonte) {
      fonte = this.ctx.createMediaElementSource(video);
      fontesDeVideo.set(video, fonte);
    }
    this.ganhoVideo = this.ctx.createGain();
    this.ganhoFundo = this.ctx.createGain();
    this.ganhoFundo.gain.value = 0;
    this.ganhoVoz = this.ctx.createGain();
    this.saida = this.ctx.createGain();
    fonte.connect(this.ganhoVideo).connect(this.saida);
    this.ganhoFundo.connect(this.saida);
    this.ganhoVoz.connect(this.saida);
    this.saida.connect(this.ctx.destination);

    const agendar = () => this.agendar();
    const parar = () => this.parar();
    video.addEventListener("playing", agendar);
    video.addEventListener("pause", parar);
    video.addEventListener("seeking", parar);
    video.addEventListener("waiting", parar);
    video.addEventListener("ended", parar);
    this.limpar = () => {
      video.removeEventListener("playing", agendar);
      video.removeEventListener("pause", parar);
      video.removeEventListener("seeking", parar);
      video.removeEventListener("waiting", parar);
      video.removeEventListener("ended", parar);
      this.parar();
      fonte!.disconnect();
      this.saida.disconnect();
    };
  }

  destruir() {
    this.limpar();
  }

  definirFundo(b: AudioBuffer | null) {
    this.fundo = b;
    this.reagendarSeTocando();
  }

  definirTomadas(t: TomadaTocavel[]) {
    this.tomadas = t;
    this.reagendarSeTocando();
  }

  definirVolumeVoz(v: number) {
    this.ganhoVoz.gain.value = v;
  }

  /** Suas falas: trechos onde o original some e entra o fundo. */
  definirJanelas(falas: Janela[]) {
    const ord = falas
      .map((f) => ({ inicioMs: Math.max(0, f.inicioMs - FOLGA_ANTES_MS), fimMs: f.fimMs + FOLGA_DEPOIS_MS }))
      .sort((a, b) => a.inicioMs - b.inicioMs);
    const unidas: Janela[] = [];
    for (const j of ord) {
      const ult = unidas[unidas.length - 1];
      if (ult && j.inicioMs <= ult.fimMs) ult.fimMs = Math.max(ult.fimMs, j.fimMs);
      else unidas.push({ ...j });
    }
    this.janelas = unidas;
    this.reagendarSeTocando();
  }

  definirModoOriginal(ligado: boolean) {
    this.modoOriginal = ligado;
    this.reagendarSeTocando();
  }

  /** Não toca estas tomadas (ex.: a fala que está sendo regravada). */
  ignorarTomadas(ids: string[]) {
    this.ignorar = new Set(ids);
    this.reagendarSeTocando();
  }

  /** Converte um tempo do AudioContext para o tempo da cena (ms), enquanto toca. */
  cenaNoTempo(ctxS: number): number | null {
    if (!this.ancora) return null;
    return this.ancora.cenaMs + (ctxS - this.ancora.ctx) * 1000;
  }

  tocando() {
    return this.ancora !== null;
  }

  private reagendarSeTocando() {
    if (this.ancora && !this.video.paused) this.agendar();
  }

  private parar() {
    this.ancora = null;
    for (const s of this.ativas) {
      try {
        s.stop();
      } catch {
        /* já parou */
      }
      s.disconnect();
    }
    this.ativas = [];
    const agora = this.ctx.currentTime;
    this.ganhoFundo.gain.cancelScheduledValues(agora);
    this.ganhoFundo.gain.setValueAtTime(0, agora);
    this.ganhoVideo.gain.cancelScheduledValues(agora);
    this.ganhoVideo.gain.setValueAtTime(1, agora);
  }

  private agendar() {
    this.parar();
    void this.ctx.resume();
    const t0 = this.ctx.currentTime + 0.01;
    const s0 = this.video.currentTime * 1000;
    this.ancora = { ctx: t0, cenaMs: s0 };
    const emCtx = (ms: number) => t0 + (ms - s0) / 1000;
    const temFundo = this.fundo !== null;
    const originalNaJanela = temFundo ? 0 : this.volumeOriginalNaMinhaFala;

    // Estado inicial e transições do original x fundo.
    const dentro = !this.modoOriginal && this.janelas.some((j) => s0 >= j.inicioMs && s0 < j.fimMs);
    const gv = this.ganhoVideo.gain;
    const gf = this.ganhoFundo.gain;
    gv.setValueAtTime(dentro ? originalNaJanela : 1, t0);
    gf.setValueAtTime(dentro && temFundo ? 1 : 0, t0);
    for (const j of this.modoOriginal ? [] : this.janelas) {
      if (j.fimMs <= s0) continue;
      if (j.inicioMs > s0) {
        gv.setTargetAtTime(originalNaJanela, emCtx(j.inicioMs), SUAVIZACAO_S);
        if (temFundo) gf.setTargetAtTime(1, emCtx(j.inicioMs), SUAVIZACAO_S);
      }
      gv.setTargetAtTime(1, emCtx(j.fimMs), SUAVIZACAO_S);
      if (temFundo) gf.setTargetAtTime(0, emCtx(j.fimMs), SUAVIZACAO_S);
    }

    if (this.fundo && s0 / 1000 < this.fundo.duration) {
      const f = this.ctx.createBufferSource();
      f.buffer = this.fundo;
      f.connect(this.ganhoFundo);
      f.start(t0, s0 / 1000);
      this.ativas.push(f);
    }

    for (const t of this.modoOriginal ? [] : this.tomadas) {
      if (this.ignorar.has(t.falaId)) continue;
      const fimMs = t.inicioMs + t.buffer.duration * 1000;
      if (fimMs <= s0) continue;
      const src = this.ctx.createBufferSource();
      src.buffer = t.buffer;
      src.connect(this.ganhoVoz);
      if (t.inicioMs >= s0) src.start(emCtx(t.inicioMs));
      else src.start(t0, (s0 - t.inicioMs) / 1000);
      this.ativas.push(src);
    }
  }
}

export async function decodificar(ctx: BaseAudioContext, blob: Blob): Promise<AudioBuffer> {
  return ctx.decodeAudioData(await blob.arrayBuffer());
}
