// Roda em segundo plano (Web Worker): transcreve a fala com o Whisper e traduz para o português.
// Os modelos são baixados do Hugging Face na primeira vez e ficam guardados no aparelho.
import { AutoModelForSeq2SeqLM, AutoTokenizer, env, pipeline, Tensor, type AutomaticSpeechRecognitionPipeline } from "@huggingface/transformers";

declare const __VERSAO_ORT__: string;
// O motor de IA vem da CDN (não vai dentro do app); os modelos vêm do Hugging Face e ficam guardados.
if (env.backends.onnx.wasm) env.backends.onnx.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${__VERSAO_ORT__}/dist/`;
env.allowLocalModels = false;

export interface Pedido {
  audio: Float32Array; // mono, 16 kHz
  idioma: string; // nome do idioma para o Whisper ("english", "portuguese"...)
  modelo: "base" | "tiny";
}

export type Mensagem =
  | { tipo: "progresso"; etapa: "baixando" | "ouvindo" | "traduzindo"; detalhe: string; fracao?: number }
  | { tipo: "pronto"; partes: { inicioMs: number; fimMs: number; texto: string; original: string }[] }
  | { tipo: "erro"; mensagem: string };

const enviar = (m: Mensagem) => (self as unknown as Worker).postMessage(m);

// Progresso somado de todos os arquivos que estão sendo baixados.
function acompanhar(rotulo: string) {
  const arquivos = new Map<string, { carregado: number; total: number }>();
  return (p: { status: string; file?: string; loaded?: number; total?: number }) => {
    if (p.status !== "progress" || !p.file || !p.total) return;
    arquivos.set(p.file, { carregado: p.loaded ?? 0, total: p.total });
    let c = 0;
    let t = 0;
    for (const a of arquivos.values()) {
      c += a.carregado;
      t += a.total;
    }
    enviar({ tipo: "progresso", etapa: "baixando", detalhe: `${rotulo} (${Math.round(t / 1e6)} MB, só na primeira vez)`, fracao: t ? c / t : 0 });
  };
}

let reconhecedor: Promise<AutomaticSpeechRecognitionPipeline> | null = null;
let modeloCarregado = "";

async function transcrever(audio: Float32Array, idioma: string, modelo: string, traduzirParaIngles: boolean) {
  if (!reconhecedor || modeloCarregado !== modelo) {
    modeloCarregado = modelo;
    reconhecedor = pipeline("automatic-speech-recognition", `onnx-community/whisper-${modelo}`, {
      dtype: { encoder_model: "q8", decoder_model_merged: "q8" },
      progress_callback: acompanhar("Baixando o reconhecimento de fala"),
    }) as Promise<AutomaticSpeechRecognitionPipeline>;
  }
  const asr = await reconhecedor;
  enviar({ tipo: "progresso", etapa: "ouvindo", detalhe: "Ouvindo o vídeo e separando as falas…" });
  const r = (await asr(audio, {
    return_timestamps: true,
    chunk_length_s: 30,
    stride_length_s: 5,
    language: idioma,
    task: traduzirParaIngles ? "translate" : "transcribe",
  })) as { chunks?: { timestamp: [number, number | null]; text: string }[] };
  return (r.chunks ?? []).map((c) => ({ inicio: c.timestamp[0], fim: c.timestamp[1], texto: c.text.trim() })).filter((c) => c.texto);
}

let tradutor: Promise<{ tok: Awaited<ReturnType<typeof AutoTokenizer.from_pretrained>>; modelo: Awaited<ReturnType<typeof AutoModelForSeq2SeqLM.from_pretrained>> }> | null = null;

async function traduzir(frases: string[]): Promise<string[]> {
  if (!tradutor) {
    const id = "Xenova/opus-mt-en-ROMANCE";
    const progresso = acompanhar("Baixando o tradutor para o português");
    tradutor = (async () => ({
      tok: await AutoTokenizer.from_pretrained(id, { progress_callback: progresso }),
      modelo: await AutoModelForSeq2SeqLM.from_pretrained(id, { dtype: "q8", progress_callback: progresso }),
    }))();
  }
  const { tok, modelo } = await tradutor;
  // O código ">>pt_br<<" escolhe o português do Brasil; ele vai direto como primeiro token da entrada.
  const alvo = BigInt(tok.convert_tokens_to_ids(">>pt_br<<") as number);
  const saida: string[] = [];
  for (let i = 0; i < frases.length; i++) {
    enviar({ tipo: "progresso", etapa: "traduzindo", detalhe: `Traduzindo para o português… ${i + 1}/${frases.length}`, fracao: i / frases.length });
    const { input_ids } = tok(frases[i]) as { input_ids: Tensor };
    const ids = [alvo, ...(input_ids.data as BigInt64Array)];
    const entrada = new Tensor("int64", BigInt64Array.from(ids), [1, ids.length]);
    const mascara = new Tensor("int64", BigInt64Array.from(ids.map(() => 1n)), [1, ids.length]);
    const r = (await modelo.generate({ input_ids: entrada, attention_mask: mascara, max_new_tokens: 128, num_beams: 1 } as never)) as Tensor;
    saida.push(tok.decode((r as unknown as Tensor[])[0] as never, { skip_special_tokens: true }).trim());
  }
  return saida;
}

self.onmessage = async (e: MessageEvent<Pedido>) => {
  try {
    const { audio, idioma, modelo } = e.data;
    const ehPortugues = idioma === "portuguese";
    const ehIngles = idioma === "english";
    // Português: só transcreve. Inglês: transcreve e traduz. Outros: o Whisper já devolve em inglês, depois traduz.
    const partes = await transcrever(audio, idioma, modelo, !ehPortugues && !ehIngles);
    const duracao = audio.length / 16000;
    const normalizadas = partes.map((p, i) => ({
      inicio: p.inicio,
      fim: p.fim ?? partes[i + 1]?.inicio ?? duracao,
      texto: p.texto,
    }));
    const traduzidas = ehPortugues ? normalizadas.map((p) => p.texto) : await traduzir(normalizadas.map((p) => p.texto));
    enviar({
      tipo: "pronto",
      partes: normalizadas.map((p, i) => ({
        inicioMs: Math.round(p.inicio * 1000),
        fimMs: Math.round(p.fim * 1000),
        texto: traduzidas[i] || p.texto,
        original: ehPortugues ? "" : p.texto,
      })),
    });
  } catch (err) {
    enviar({ tipo: "erro", mensagem: err instanceof Error ? err.message : String(err) });
  }
};
