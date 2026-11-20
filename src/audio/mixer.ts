import { limitesDaFala } from "./sincronia";
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
/** Entre duas falas suas, um espaço menor que isto fica fechado (a voz original não "pisca" no meio da sua dublagem). */
const ESPACO_FECHADO_MS = 1500;
const SUAVIZACAO_S = 0.02;
/** Enquanto grava: silêncio desde antes da folga gravada (250 ms + atraso do som) até depois dela (600 ms). */
const MARGEM_GRAVANDO_ANTES_MS = 350;
const MARGEM_GRAVANDO_DEPOIS_MS = 450;


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
  /** Som do vídeo sem a voz (ambiente e música), para tocar junto com a sua fala quando não há trilha de fundo. */
  private ganhoSemVoz: GainNode;
  /** Liga o som ambiente automático nas suas falas. */
  somAmbiente = true;
  /** Saída final (depois do limitador): é o que toca e o que vai para o vídeo exportado. */
  readonly saida: GainNode;
  private soma: GainNode;
  private limitador: DynamicsCompressorNode;
  private fundo: AudioBuffer | null = null;
  private tomadas: TomadaTocavel[] = [];
  private janelas: Janela[] = [];
  /** Todas as falas da cena: a sua voz de uma fala para quando a próxima fala (de qualquer um) começa. */
  private falasDaCena: { id: string; inicioMs: number; fimMs: number }[] = [];
  private ativas: AudioBufferSourceNode[] = [];
  private ancora: { ctx: number; cenaMs: number } | null = null;
  private ignorar = new Set<string>();
  /** Toca a cena como ela é: sem silenciar o original e sem as suas tomadas. */
  private modoOriginal = false;
  volumeOriginalNaMinhaFala = 0;
  /** "Guia": volume da voz original durante a gravação (0 = desligado). Só no estúdio, enquanto grava. */
  guia = 0;
  /**
   * Gravando: o vídeo fica mudo (sem voz original, sem música). Assim o microfone não capta de volta o som do
   * alto-falante (era isso que fazia eco e chiado). O som ambiente do vídeo entra depois, no resultado final.
   */
  gravando = false;
  /** Modo Cantar: enquanto grava, o instrumental continua tocando (a pessoa usa fone de ouvido). */
  cantando = false;
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
    // Tudo se soma aqui e passa por um limitador (como nos estúdios): a mistura nunca passa do máximo e não "estoura".
    this.soma = this.ctx.createGain();
    this.limitador = this.ctx.createDynamicsCompressor();
    this.limitador.threshold.value = -6;
    this.limitador.knee.value = 4;
    this.limitador.ratio.value = 20;
    this.limitador.attack.value = 0.002;
    this.limitador.release.value = 0.18;
    this.saida = this.ctx.createGain();
    this.ganhoSemVoz = this.ctx.createGain();
    this.ganhoSemVoz.gain.value = 0;
    fonte.connect(this.ganhoVideo).connect(this.soma);
    const semVoz = montarSemVoz(this.ctx, fonte);
    semVoz.connect(this.ganhoSemVoz).connect(this.soma);
    this.ganhoFundo.connect(this.soma);
    this.ganhoVoz.connect(this.soma);
    this.soma.connect(this.limitador).connect(this.saida);
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
      semVoz.disconnect();
      this.soma.disconnect();
      this.limitador.disconnect();
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

  definirFalasDaCena(falas: { id: string; inicioMs: number; fimMs: number }[]) {
    this.falasDaCena = falas;
    this.reagendarSeTocando();
  }

  definirVolumeVoz(v: number) {
    this.ganhoVoz.gain.value = v;
  }

  /** Suas falas: trechos onde o original some e entra o fundo. */
  definirJanelas(falas: Janela[], cenaInteira = false) {
    // Dublando todos os personagens: a voz original não volta em momento nenhum (fica só o ambiente).
    if (cenaInteira && falas.length) {
      this.janelas = [{ inicioMs: 0, fimMs: Number.MAX_SAFE_INTEGER }];
      this.reagendarSeTocando();
      return;
    }
    const ord = falas
      .map((f) => ({ inicioMs: Math.max(0, f.inicioMs - FOLGA_ANTES_MS), fimMs: f.fimMs + FOLGA_DEPOIS_MS }))
      .sort((a, b) => a.inicioMs - b.inicioMs);
    const unidas: Janela[] = [];
    for (const j of ord) {
      const ult = unidas[unidas.length - 1];
      if (ult && j.inicioMs <= ult.fimMs + ESPACO_FECHADO_MS) ult.fimMs = Math.max(ult.fimMs, j.fimMs);
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
    this.ganhoSemVoz.gain.cancelScheduledValues(agora);
    this.ganhoSemVoz.gain.setValueAtTime(0, agora);
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
    const gravando = this.gravando;
    const originalNaJanela = gravando ? this.guia : Math.max(this.guia, temFundo ? 0 : this.volumeOriginalNaMinhaFala);
    // Gravando: vídeo mudo (o microfone só capta você). O som ambiente entra depois, no resultado.
    // Com o "Guia" ligado (fone de ouvido) a cena continua tocando e a voz original fica baixinha na sua fala.
    const mudo = gravando && !this.cantando;
    const nivelFundo = mudo ? 0 : 1;
    const foraDaJanela = mudo && this.guia === 0 ? 0 : 1;
    const janelas = gravando
      ? this.janelas.map((j) => ({ inicioMs: Math.max(0, j.inicioMs - MARGEM_GRAVANDO_ANTES_MS), fimMs: j.fimMs + MARGEM_GRAVANDO_DEPOIS_MS }))
      : this.janelas;

    // Estado inicial e transições do original x fundo.
    const dentro = !this.modoOriginal && janelas.some((j) => s0 >= j.inicioMs && s0 < j.fimMs);
    const gv = this.ganhoVideo.gain;
    const gf = this.ganhoFundo.gain;
    // Sem trilha de fundo enviada: na sua fala entra o som do próprio vídeo sem a voz original.
    const ambiente = !temFundo && this.somAmbiente;
    const ga = this.ganhoSemVoz.gain;
    gv.setValueAtTime(dentro ? originalNaJanela : foraDaJanela, t0);
    gf.setValueAtTime(dentro && temFundo ? nivelFundo : 0, t0);
    ga.setValueAtTime(dentro && ambiente ? nivelFundo : 0, t0);
    for (const j of this.modoOriginal ? [] : janelas) {
      if (j.fimMs <= s0) continue;
      if (j.inicioMs > s0) {
        gv.setTargetAtTime(originalNaJanela, emCtx(j.inicioMs), SUAVIZACAO_S);
        if (temFundo) gf.setTargetAtTime(nivelFundo, emCtx(j.inicioMs), SUAVIZACAO_S);
        if (ambiente) ga.setTargetAtTime(nivelFundo, emCtx(j.inicioMs), SUAVIZACAO_S);
      }
      gv.setTargetAtTime(foraDaJanela, emCtx(j.fimMs), SUAVIZACAO_S);
      if (temFundo) gf.setTargetAtTime(0, emCtx(j.fimMs), SUAVIZACAO_S);
      if (ambiente) ga.setTargetAtTime(0, emCtx(j.fimMs), SUAVIZACAO_S);
    }

    if (this.fundo && s0 / 1000 < this.fundo.duration) {
      const f = this.ctx.createBufferSource();
      f.buffer = this.fundo;
      f.connect(this.ganhoFundo);
      f.start(t0, s0 / 1000);
      this.ativas.push(f);
    }

    // Uma tomada nunca toca junto com a próxima: termina (com um fade curtinho) quando a seguinte começa.
    // Sem isso, as sobras de antes/depois de falas muito próximas se sobrepõem e a voz soa duplicada (eco).
    const tocaveis = (this.modoOriginal ? [] : this.tomadas).filter((t) => !this.ignorar.has(t.falaId)).sort((a, b) => a.inicioMs - b.inicioMs);
    tocaveis.forEach((t, k) => {
      const proxima = tocaveis[k + 1];
      // Também para quando começa a fala seguinte de OUTRO personagem (cada um fala na sua vez, sem invadir).
      const f = this.falasDaCena.find((x) => x.id === t.falaId);
      const limite = f ? limitesDaFala(f, this.falasDaCena).depois : Infinity;
      const fimMs = Math.min(t.inicioMs + t.buffer.duration * 1000, proxima ? proxima.inicioMs : Infinity, Math.max(limite, f ? f.fimMs : 0));
      if (fimMs <= s0 || fimMs <= t.inicioMs) return;
      const src = this.ctx.createBufferSource();
      src.buffer = t.buffer;
      const g = this.ctx.createGain();
      src.connect(g).connect(this.ganhoVoz);
      if (t.inicioMs >= s0) src.start(emCtx(t.inicioMs));
      else src.start(t0, (s0 - t.inicioMs) / 1000);
      if (fimMs < t.inicioMs + t.buffer.duration * 1000) {
        const corte = Math.max(t0, emCtx(fimMs));
        g.gain.setValueAtTime(1, Math.max(t0, corte - 0.03));
        g.gain.linearRampToValueAtTime(0, corte);
        src.stop(corte + 0.01);
      }
      this.ativas.push(src);
    });
  }
}

export async function decodificar(ctx: BaseAudioContext, blob: Blob): Promise<AudioBuffer> {
  return ctx.decodeAudioData(await blob.arrayBuffer());
}

/**
 * "Tira a voz" do som do vídeo, como nos karaokês: em filmes, séries e desenhos a voz fica no centro do estéreo
 * (igual nos dois lados), enquanto música e ambiente ficam espalhados. Tirando o centro (esquerda − direita) a voz
 * some e o ambiente fica; os graves (batidas, explosões) voltam por um filtro abaixo de ~120 Hz, onde quase não há voz.
 * Vídeo mono: não há o que separar — sai só o grave (a voz original não vaza).
 */
function montarSemVoz(ctx: AudioContext, fonte: AudioNode): AudioNode {
  // Garante 2 canais (um vídeo mono vira esquerda = direita, e aí o "centro" inteiro é retirado).
  const estereo = ctx.createGain();
  estereo.channelCount = 2;
  estereo.channelCountMode = "explicit";
  estereo.channelInterpretation = "speakers";
  fonte.connect(estereo);
  const separa = ctx.createChannelSplitter(2);
  estereo.connect(separa);

  // Lados: E − D (sem a voz do centro), igual nos dois ouvidos — invertido num deles a sensação de espaço seria maior,
  // mas o alto-falante do celular (que mistura os dois) cancelaria tudo.
  const ladosE = ctx.createGain();
  const ladosD = ctx.createGain();
  ladosE.gain.value = 0.75;
  ladosD.gain.value = -0.75;
  separa.connect(ladosE, 0);
  separa.connect(ladosD, 1);
  const lados = ctx.createGain(); // soma E·0,75 − D·0,75
  ladosE.connect(lados);
  ladosD.connect(lados);

  // Graves do centro (E + D) abaixo de ~120 Hz, com filtro de 4ª ordem.
  const centro = ctx.createGain();
  centro.gain.value = 0.5;
  separa.connect(centro, 0);
  separa.connect(centro, 1);
  const pb1 = ctx.createBiquadFilter();
  const pb2 = ctx.createBiquadFilter();
  pb1.type = pb2.type = "lowpass";
  pb1.frequency.value = pb2.frequency.value = 120;
  pb1.Q.value = pb2.Q.value = 0.7;
  centro.connect(pb1).connect(pb2);

  const junta = ctx.createChannelMerger(2);
  lados.connect(junta, 0, 0);
  lados.connect(junta, 0, 1);
  pb2.connect(junta, 0, 0);
  pb2.connect(junta, 0, 1);
  return junta;
}
