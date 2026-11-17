// Servidor do Dubla Brasil AI (Supabase): cenas e sons ficam aqui e aparecem para todos os usuários.
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_CHAVE, SUPABASE_URL } from "./nuvem-config";
import type { Cena, Som } from "./tipos";

export const supabase = createClient(SUPABASE_URL, SUPABASE_CHAVE, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

const PASTA = "midias";
const LIMITE_BYTES = 50 * 1024 * 1024;

/** Transforma erros do servidor em mensagens em português. */
export function mensagemDeErro(e: unknown): string {
  const texto = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e);
  if (/row-level security|permission denied|not authorized|JWT|403/i.test(texto)) return "Sem permissão: entre de novo como administrador.";
  if (/payload too large|exceeded the maximum|413|too large/i.test(texto)) return "Arquivo grande demais: o limite é 50 MB por arquivo.";
  if (/mime type|invalid_mime|not supported/i.test(texto)) return "Tipo de arquivo não aceito. Use MP4/WebM para vídeo, MP3/M4A/WAV/OGG para áudio.";
  if (/Failed to fetch|NetworkError|network|Load failed|fetch/i.test(texto)) return "Sem conexão com o servidor. Confira a internet e tente de novo.";
  if (/Invalid login credentials/i.test(texto)) return "E-mail ou senha incorretos.";
  if (/Email not confirmed/i.test(texto)) return "Este e-mail ainda não foi confirmado no Supabase.";
  return texto || "Algo deu errado no servidor.";
}

function falhou(e: unknown): never {
  throw new Error(mensagemDeErro(e));
}

export function urlPublica(caminho: string): string {
  return supabase.storage.from(PASTA).getPublicUrl(caminho).data.publicUrl;
}

const EXTENSOES: Record<string, string> = {
  "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
  "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/aac": "aac", "audio/wav": "wav", "audio/x-wav": "wav",
  "audio/ogg": "ogg", "audio/webm": "webm", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
};

function tipoDoArquivo(b: Blob, nome?: string): string {
  if (b.type && b.type !== "application/octet-stream") return b.type === "audio/x-m4a" ? "audio/mp4" : b.type;
  const ext = nome?.split(".").pop()?.toLowerCase() ?? "";
  const achado = Object.entries(EXTENSOES).find(([, e]) => e === ext);
  return achado?.[0] ?? "application/octet-stream";
}

/** Envia um arquivo para a pasta "midias" com um nome novo (evita o cache de versões antigas). */
async function enviar(pasta: string, nomeBase: string, arquivo: Blob): Promise<string> {
  if (arquivo.size > LIMITE_BYTES)
    throw new Error(`O arquivo tem ${(arquivo.size / 1024 / 1024).toFixed(0)} MB. O limite é 50 MB: use um vídeo mais curto ou comprimido.`);
  const tipo = tipoDoArquivo(arquivo, arquivo instanceof File ? arquivo.name : undefined);
  const caminho = `${pasta}/${nomeBase}-${Date.now().toString(36)}.${EXTENSOES[tipo] ?? "bin"}`;
  const { error } = await supabase.storage.from(PASTA).upload(caminho, arquivo, { contentType: tipo, upsert: false, cacheControl: "31536000" });
  if (error) falhou(error);
  return caminho;
}

async function apagarArquivos(caminhos: (string | null | undefined)[]) {
  const lista = caminhos.filter((c): c is string => !!c);
  if (lista.length) await supabase.storage.from(PASTA).remove(lista); // falha aqui só deixa sobras, não quebra nada
}

// ---------- Cenas ----------

interface LinhaCena {
  id: string;
  titulo: string;
  descricao: string;
  idioma: string;
  duracao_ms: number;
  video_path: string;
  fundo_path: string | null;
  capa_path: string | null;
  personagens: Cena["personagens"];
  falas: Cena["falas"];
  publicada: boolean;
  criada_em: string;
  atualizada_em: string;
}

function linhaParaCena(l: LinhaCena): Cena {
  return {
    id: l.id,
    titulo: l.titulo,
    descricao: l.descricao,
    idioma: l.idioma,
    duracaoMs: l.duracao_ms,
    video: { tipo: "url", url: urlPublica(l.video_path) },
    fundo: l.fundo_path ? { tipo: "url", url: urlPublica(l.fundo_path) } : null,
    capa: l.capa_path ? { tipo: "url", url: urlPublica(l.capa_path) } : null,
    personagens: (l.personagens ?? []).map((p) => ({ ...p, foto: p.fotoPath ? urlPublica(p.fotoPath) : null })),
    falas: l.falas ?? [],
    publicada: l.publicada,
    criadaEm: Date.parse(l.criada_em),
    atualizadaEm: Date.parse(l.atualizada_em),
    caminhos: {
      video: l.video_path,
      fundo: l.fundo_path,
      capa: l.capa_path,
      rostos: Object.fromEntries((l.personagens ?? []).filter((p) => p.fotoPath).map((p) => [p.id, p.fotoPath as string])),
    },
  };
}

export async function listarCenas(incluirOcultas = false): Promise<Cena[]> {
  let q = supabase.from("cenas").select("*").order("atualizada_em", { ascending: false });
  if (!incluirOcultas) q = q.eq("publicada", true);
  const { data, error } = await q;
  if (error) falhou(error);
  return (data as LinhaCena[]).map(linhaParaCena);
}

export async function obterCena(id: string): Promise<Cena | undefined> {
  const { data, error } = await supabase.from("cenas").select("*").eq("id", id).maybeSingle();
  if (error) falhou(error);
  return data ? linhaParaCena(data as LinhaCena) : undefined;
}

/**
 * Salva a cena no servidor. Arquivos novos são enviados; `fundo: null` remove a trilha de fundo.
 * Arquivos substituídos são apagados do servidor depois que a cena foi salva.
 */
export async function salvarCena(
  cena: Cena,
  arquivos: { video?: Blob; fundo?: Blob | null; capa?: Blob; rostos?: Record<string, Blob | null> } = {},
): Promise<Cena> {
  const antes = cena.caminhos;
  const pasta = `cenas/${cena.id}`;
  const novos: string[] = [];
  try {
    const video = arquivos.video ? await enviar(pasta, "video", arquivos.video) : antes?.video;
    if (arquivos.video) novos.push(video!);
    if (!video) throw new Error("A cena precisa de um vídeo.");
    const fundo = arquivos.fundo ? await enviar(pasta, "fundo", arquivos.fundo) : arquivos.fundo === null ? null : (antes?.fundo ?? null);
    if (arquivos.fundo) novos.push(fundo!);
    const capa = arquivos.capa ? await enviar(pasta, "capa", arquivos.capa) : (antes?.capa ?? null);
    if (arquivos.capa) novos.push(capa!);
    // Rostos: Blob = foto nova; null = remover; ausente = manter a atual.
    const personagens = [];
    for (const p of cena.personagens) {
      const pedido = arquivos.rostos?.[p.id];
      let fotoPath = pedido === null ? null : (p.fotoPath ?? antes?.rostos?.[p.id] ?? null);
      if (pedido) {
        fotoPath = await enviar(pasta, `rosto-${p.id}`, pedido);
        novos.push(fotoPath);
      }
      personagens.push({ id: p.id, nome: p.nome, cor: p.cor, fotoPath });
    }
    const rostosFinais = new Set(personagens.map((p) => p.fotoPath).filter(Boolean));
    const linha = {
      id: cena.id,
      titulo: cena.titulo,
      descricao: cena.descricao,
      idioma: cena.idioma,
      duracao_ms: Math.round(cena.duracaoMs),
      video_path: video,
      fundo_path: fundo,
      capa_path: capa,
      personagens,
      falas: cena.falas,
      publicada: cena.publicada !== false,
    };
    const { data, error } = await supabase.from("cenas").upsert(linha).select("*").single();
    if (error) falhou(error);
    await apagarArquivos([
      arquivos.video ? antes?.video : null,
      arquivos.fundo !== undefined ? antes?.fundo : null,
      arquivos.capa ? antes?.capa : null,
      ...Object.values(antes?.rostos ?? {}).filter((c) => !rostosFinais.has(c)),
    ]);
    return linhaParaCena(data as LinhaCena);
  } catch (e) {
    await apagarArquivos(novos); // não deixa arquivos órfãos se algo falhar no meio
    throw e;
  }
}

export async function publicarCena(id: string, publicada: boolean) {
  const { error } = await supabase.from("cenas").update({ publicada }).eq("id", id);
  if (error) falhou(error);
}

export async function excluirCena(c: Cena) {
  const { error } = await supabase.from("cenas").delete().eq("id", c.id);
  if (error) falhou(error);
  await apagarArquivos([c.caminhos?.video, c.caminhos?.fundo, c.caminhos?.capa, ...Object.values(c.caminhos?.rostos ?? {})]);
}

// ---------- Sons ----------

interface LinhaSom {
  id: string;
  titulo: string;
  categoria: string;
  emoji: string;
  audio_path: string;
  duracao_ms: number;
  publicada: boolean;
  criada_em: string;
}

function linhaParaSom(l: LinhaSom): Som {
  return {
    id: l.id,
    titulo: l.titulo,
    categoria: l.categoria,
    emoji: l.emoji,
    midia: { tipo: "url", url: urlPublica(l.audio_path) },
    duracaoMs: l.duracao_ms,
    publicada: l.publicada,
    criadoEm: Date.parse(l.criada_em),
    caminho: l.audio_path,
  };
}

export async function listarSons(incluirOcultos = false): Promise<Som[]> {
  let q = supabase.from("sons").select("*").order("criada_em", { ascending: false });
  if (!incluirOcultos) q = q.eq("publicada", true);
  const { data, error } = await q;
  if (error) falhou(error);
  return (data as LinhaSom[]).map(linhaParaSom);
}

export async function obterSom(id: string): Promise<Som | undefined> {
  const { data, error } = await supabase.from("sons").select("*").eq("id", id).maybeSingle();
  if (error) falhou(error);
  return data ? linhaParaSom(data as LinhaSom) : undefined;
}

export async function salvarSom(som: Som, arquivo?: Blob): Promise<Som> {
  const novo = arquivo ? await enviar(`sons/${som.id}`, "som", arquivo) : null;
  const caminho = novo ?? som.caminho;
  if (!caminho) throw new Error("Escolha o arquivo do som.");
  try {
    const { data, error } = await supabase
      .from("sons")
      .upsert({ id: som.id, titulo: som.titulo, categoria: som.categoria, emoji: som.emoji, audio_path: caminho, duracao_ms: Math.round(som.duracaoMs), publicada: som.publicada })
      .select("*")
      .single();
    if (error) falhou(error);
    if (novo && som.caminho) await apagarArquivos([som.caminho]);
    return linhaParaSom(data as LinhaSom);
  } catch (e) {
    if (novo) await apagarArquivos([novo]);
    throw e;
  }
}

export async function publicarSom(id: string, publicada: boolean) {
  const { error } = await supabase.from("sons").update({ publicada }).eq("id", id);
  if (error) falhou(error);
}

export async function excluirSom(s: Som) {
  const { error } = await supabase.from("sons").delete().eq("id", s.id);
  if (error) falhou(error);
  await apagarArquivos([s.caminho]);
}

// ---------- Login do administrador ----------

export async function entrarComoAdmin(email: string, senha: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
  if (error) falhou(error);
  if (!(await souAdmin())) {
    await supabase.auth.signOut();
    throw new Error("Esta conta não é de administrador.");
  }
}

export async function souAdmin(): Promise<boolean> {
  const { data: sessao } = await supabase.auth.getSession();
  if (!sessao.session) return false;
  const { data, error } = await supabase.rpc("eh_admin");
  if (error) return false;
  return data === true;
}

export async function sairDoAdmin() {
  await supabase.auth.signOut();
}

export async function trocarSenha(nova: string) {
  const { error } = await supabase.auth.updateUser({ password: nova });
  if (error) falhou(error);
}
