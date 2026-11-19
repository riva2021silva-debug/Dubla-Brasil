// Deixa o vídeo da cena "leve para pular": o estúdio pula para cada fala toda hora (contagem, "Ouvir original",
// próxima fala). Vídeos gravados/editados pelo próprio celular saem "fragmentados" e com poucos quadros-chave, e cada
// pulo demorava 1,5 a 3 segundos (o vídeo travava). Aqui o vídeo é refeito no próprio aparelho, sem servidor:
//  - índice no começo do arquivo (começa a tocar sem baixar tudo);
//  - um quadro-chave por segundo (pular para uma fala fica quase instantâneo);
//  - 30 quadros por segundo constantes e no máximo 1280 px.
// Usa a biblioteca Mediabunny (licença MPL-2.0), carregada só quando precisa.

export interface Diagnostico {
  /** Motivos para otimizar (vazio = o vídeo já está bom). */
  motivos: string[];
}

/** Caixas de primeiro nível de um MP4 (para achar "fragmentado" e "índice no fim"). */
async function caixasMp4(b: Blob): Promise<string[]> {
  const nomes: string[] = [];
  let pos = 0;
  while (pos + 8 <= b.size && nomes.length < 4000) {
    const cab = new DataView(await b.slice(pos, pos + 16).arrayBuffer());
    let tam = cab.getUint32(0);
    const nome = String.fromCharCode(cab.getUint8(4), cab.getUint8(5), cab.getUint8(6), cab.getUint8(7));
    if (tam === 1 && cab.byteLength >= 16) tam = Number(cab.getBigUint64(8));
    if (tam === 0) tam = b.size - pos;
    if (tam < 8 || !/^[\x20-\x7e]{4}$/.test(nome)) return [];
    nomes.push(nome);
    pos += tam;
  }
  return nomes;
}

/** Confere se o vídeo vai travar no estúdio. */
export async function diagnosticar(b: Blob): Promise<Diagnostico> {
  const motivos: string[] = [];
  const caixas = await caixasMp4(b);
  if (!caixas.length) motivos.push("formato que o celular não pula bem (não é MP4 comum)");
  if (caixas.includes("moof")) motivos.push("vídeo fragmentado (pular para a fala demora)");
  const moov = caixas.indexOf("moov"), mdat = caixas.indexOf("mdat");
  if (moov > mdat && mdat >= 0) motivos.push("índice no fim do arquivo (demora para começar)");
  try {
    const { Input, BlobSource, ALL_FORMATS, EncodedPacketSink } = await import("mediabunny");
    const entrada = new Input({ source: new BlobSource(b), formats: ALL_FORMATS });
    const trilha = await entrada.getPrimaryVideoTrack();
    if (trilha) {
      const sink = new EncodedPacketSink(trilha);
      let ultimo = await sink.getFirstPacket({ metadataOnly: true });
      let maiorEspaco = 0;
      for (let i = 0; ultimo && i < 2000; i++) {
        const prox = await sink.getNextKeyPacket(ultimo, { metadataOnly: true });
        if (!prox) break;
        maiorEspaco = Math.max(maiorEspaco, prox.timestamp - ultimo.timestamp);
        ultimo = prox;
      }
      if (maiorEspaco > 1.5) motivos.push(`poucos quadros-chave (um a cada ${maiorEspaco.toFixed(1)} s)`);
      if (Math.max(trilha.displayWidth, trilha.displayHeight) > 1920) motivos.push("resolução maior que o necessário");
    }
    entrada.dispose?.();
  } catch {
    /* sem como ler: fica só com o que as caixas disseram */
  }
  return { motivos };
}

/** O aparelho consegue refazer vídeos (WebCodecs)? */
export function podeOtimizar(): boolean {
  return typeof VideoEncoder !== "undefined" && typeof VideoDecoder !== "undefined";
}

/**
 * Refaz o vídeo no formato bom para o estúdio. Devolve null se o aparelho não consegue (aí fica o original).
 * `aoProgredir` recebe de 0 a 1.
 */
export async function otimizarVideo(b: Blob, aoProgredir: (fracao: number) => void = () => {}): Promise<Blob | null> {
  if (!podeOtimizar()) return null;
  const mb = await import("mediabunny");
  const entrada = new mb.Input({ source: new mb.BlobSource(b), formats: mb.ALL_FORMATS });
  const trilha = await entrada.getPrimaryVideoTrack();
  if (!trilha) return null;
  if (!(await mb.canEncodeVideo("avc"))) return null;
  const temSom = !!(await entrada.getPrimaryAudioTrack());
  const maior = Math.max(trilha.displayWidth, trilha.displayHeight);
  const reduzir = maior > 1280;
  const alvo = new mb.BufferTarget();
  const saida = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }), target: alvo });
  const conversao = await mb.Conversion.init({
    input: entrada,
    output: saida,
    video: {
      codec: "avc",
      keyFrameInterval: 1,
      frameRate: 30,
      quality: mb.QUALITY_MEDIUM,
      forceTranscode: true,
      ...(reduzir ? (trilha.displayWidth >= trilha.displayHeight ? { width: 1280 } : { height: 1280 }) : {}),
    },
    // Som: copiado exatamente como está (não precisa refazer, e assim nunca perde qualidade).
    showWarnings: false,
  });
  // Se alguma trilha ficasse de fora (ex.: o som), não serve: fica o vídeo original.
  if (!conversao.isValid || conversao.discardedTracks.length) return null;
  conversao.onProgress = (p) => aoProgredir(Math.min(1, p));
  await conversao.execute();
  if (!alvo.buffer) return null;
  const novo = new Blob([alvo.buffer], { type: "video/mp4" });
  // Confere de novo: o vídeo novo precisa ter som se o original tinha.
  const conferir = new mb.Input({ source: new mb.BlobSource(novo), formats: mb.ALL_FORMATS });
  const somNovo = !!(await conferir.getPrimaryAudioTrack());
  conferir.dispose();
  entrada.dispose();
  if (temSom && !somNovo) return null;
  return novo;
}
