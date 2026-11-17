// Pacote de cena (.dubla): um ZIP com cena.json, o vídeo e a trilha de fundo.
// Serve para compartilhar uma cena com outra pessoa ou levar para outro navegador.
import { unzip, zip } from "fflate";
import { blobDaMidia } from "./db";
import { salvarCena } from "./nuvem";
import type { Cena } from "./tipos";
import { novoId } from "./util";

const VERSAO_PACOTE = 1;

function extensao(tipo: string, padrao: string) {
  if (tipo.includes("webm")) return "webm";
  if (tipo.includes("mp4")) return padrao === "m4a" ? "m4a" : "mp4";
  if (tipo.includes("mpeg")) return "mp3";
  if (tipo.includes("ogg")) return "ogg";
  if (tipo.includes("wav")) return "wav";
  return padrao;
}

export async function exportarPacote(cena: Cena): Promise<Blob> {
  const video = await blobDaMidia(cena.video);
  const fundo = cena.fundo ? await blobDaMidia(cena.fundo) : null;
  const nomeVideo = `video.${extensao(video.type, "mp4")}`;
  const nomeFundo = fundo ? `fundo.${extensao(fundo.type, "m4a")}` : null;
  const meta = {
    formato: "dubla-brasil",
    versao: VERSAO_PACOTE,
    cena: { ...cena, video: nomeVideo, fundo: nomeFundo, capa: undefined, publicada: undefined },
  };
  const arquivos: Record<string, Uint8Array> = {
    "cena.json": new TextEncoder().encode(JSON.stringify(meta, null, 2)),
    [nomeVideo]: new Uint8Array(await video.arrayBuffer()),
  };
  if (fundo && nomeFundo) arquivos[nomeFundo] = new Uint8Array(await fundo.arrayBuffer());
  const dados = await new Promise<Uint8Array>((ok, erro) =>
    zip(arquivos, { level: 0 }, (e, d) => (e ? erro(e) : ok(d))),
  );
  return new Blob([dados as Uint8Array<ArrayBuffer>], { type: "application/zip" });
}

const TIPOS: Record<string, string> = {
  mp4: "video/mp4", webm: "video/webm", m4a: "audio/mp4", mp3: "audio/mpeg", ogg: "audio/ogg", wav: "audio/wav",
};

export async function importarPacote(arquivo: File): Promise<Cena> {
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  const conteudo = await new Promise<Record<string, Uint8Array>>((ok, erro) =>
    unzip(bytes, (e, d) => (e ? erro(new Error("Este arquivo não é um pacote do Dubla Brasil.")) : ok(d))),
  );
  if (!conteudo["cena.json"]) throw new Error("Pacote inválido: falta o cena.json.");
  const meta = JSON.parse(new TextDecoder().decode(conteudo["cena.json"]));
  if (meta.formato !== "dubla-brasil") throw new Error("Pacote inválido: formato desconhecido.");
  const c = meta.cena;
  const blobDe = (nome: string) => {
    const d = conteudo[nome];
    if (!d) throw new Error(`Pacote incompleto: falta ${nome}.`);
    const ext = nome.split(".").pop() ?? "";
    return new Blob([d as Uint8Array<ArrayBuffer>], { type: TIPOS[ext] ?? "application/octet-stream" });
  };
  const id = novoId();
  const video = blobDe(c.video);
  const fundo = c.fundo ? blobDe(c.fundo) : null;
  const agora = Date.now();
  const cena: Cena = {
    id,
    titulo: String(c.titulo ?? "Cena importada"),
    descricao: String(c.descricao ?? ""),
    idioma: String(c.idioma ?? "Outro"),
    duracaoMs: Number(c.duracaoMs) || 0,
    video: { tipo: "blob", chave: "" },
    fundo: null,
    personagens: Array.isArray(c.personagens) ? c.personagens.map((p: Cena["personagens"][0]) => ({ id: p.id, nome: p.nome, cor: p.cor })) : [],
    falas: Array.isArray(c.falas) ? c.falas : [],
    criadaEm: agora,
    atualizadaEm: agora,
    publicada: false,
    capa: null,
  };
  // Envia para o servidor como cena oculta, para o administrador revisar antes de publicar.
  return salvarCena(cena, { video, fundo: fundo ?? undefined });
}
