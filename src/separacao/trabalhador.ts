// Roda em segundo plano (Web Worker): baixa o modelo HTDemucs (uma vez só; fica guardado no aparelho) e separa a voz.
import * as ort from "onnxruntime-web/webgpu";
import { PEDACO, separarVoz } from "./demucs";

declare const __VERSAO_ORT__: string;
ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${__VERSAO_ORT__}/dist/`;
ort.env.wasm.numThreads = (self as unknown as { crossOriginIsolated?: boolean }).crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;

export const URL_MODELO = "https://huggingface.co/timcsy/demucs-web-onnx/resolve/main/htdemucs_embedded.onnx";

export interface PedidoSeparar {
  esq: Float32Array;
  dir: Float32Array;
  /** Outro endereço do modelo (testes). */
  urlModelo?: string;
}
export type MensagemSeparar =
  | { tipo: "progresso"; etapa: "baixando" | "preparando" | "separando"; fracao: number; detalhe: string }
  | { tipo: "pronto"; esq: Float32Array; dir: Float32Array; motor: string }
  | { tipo: "erro"; mensagem: string };

const enviar = (m: MensagemSeparar, transferir: Transferable[] = []) => (self as unknown as Worker).postMessage(m, transferir);

async function baixarModelo(URL_MODELO: string): Promise<Uint8Array> {
  let cache: Cache | null = null;
  try {
    cache = await caches.open("dubla-modelos");
    const guardado = await cache.match(URL_MODELO);
    if (guardado) return new Uint8Array(await guardado.arrayBuffer());
  } catch {
    cache = null;
  }
  const r = await fetch(URL_MODELO);
  if (!r.ok || !r.body) throw new Error("Não foi possível baixar o modelo de IA. Confira a internet.");
  const total = Number(r.headers.get("content-length")) || 180_000_000;
  const leitor = r.body.getReader();
  const partes: Uint8Array[] = [];
  let recebido = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    partes.push(value);
    recebido += value.length;
    enviar({ tipo: "progresso", etapa: "baixando", fracao: recebido / total, detalhe: `Baixando a IA de separação (só na primeira vez)… ${Math.round(recebido / 1e6)} de ${Math.round(total / 1e6)} MB` });
  }
  const dados = new Uint8Array(recebido);
  let pos = 0;
  for (const p of partes) {
    dados.set(p, pos);
    pos += p.length;
  }
  try {
    await cache?.put(URL_MODELO, new Response(dados.slice()));
  } catch {
    /* sem espaço para guardar: baixa de novo na próxima vez */
  }
  return dados;
}

self.onmessage = async (e: MessageEvent<PedidoSeparar>) => {
  try {
    const modelo = await baixarModelo(e.data.urlModelo || URL_MODELO);
    enviar({ tipo: "progresso", etapa: "preparando", fracao: 0, detalhe: "Preparando a IA…" });
    let sessao: ort.InferenceSession;
    let motor = "webgpu";
    try {
      sessao = await ort.InferenceSession.create(modelo, { executionProviders: ["webgpu"] });
    } catch {
      motor = "wasm";
      sessao = await ort.InferenceSession.create(modelo, { executionProviders: ["wasm"] });
    }
    const rodar = async (onda: Float32Array, espectro: Float32Array) => {
      const r = await sessao.run({ input: new ort.Tensor("float32", onda, [1, 2, PEDACO]), x: new ort.Tensor("float32", espectro, [1, 4, 2048, 336]) });
      return { espectro: (await r.output.getData()) as Float32Array, onda: (await r.add_67.getData()) as Float32Array };
    };
    const { esq, dir } = e.data;
    const inicio = Date.now();
    const r = await separarVoz(esq, dir, rodar, (f) => {
      const passou = (Date.now() - inicio) / 1000;
      const falta = f > 0 ? Math.max(0, (passou / f) * (1 - f)) : 0;
      enviar({ tipo: "progresso", etapa: "separando", fracao: f, detalhe: `Tirando as vozes do vídeo… ${Math.round(f * 100)}%${f > 0 && f < 1 ? ` (falta ~${Math.ceil(falta / 60)} min)` : ""}` });
    });
    enviar({ tipo: "pronto", esq: r.fundo[0], dir: r.fundo[1], motor }, [r.fundo[0].buffer, r.fundo[1].buffer]);
  } catch (err) {
    enviar({ tipo: "erro", mensagem: err instanceof Error ? err.message : String(err) });
  }
};
