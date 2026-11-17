// Galeria de dubs: apelido (login anônimo), publicar, reagir, comentar, denunciar e moderar.
import { mensagemDeErro, supabase } from "./nuvem";

const PASTA = "dubs";
const LIMITE_BYTES = 15 * 1024 * 1024;

export interface Publicacao {
  id: string;
  autorId: string;
  apelido: string;
  cenaId: string | null;
  cenaTitulo: string;
  papeis: string[];
  video: string;
  capa: string | null;
  videoPath: string;
  capaPath: string | null;
  duracaoMs: number;
  oculta: boolean;
  curtidas: number;
  descurtidas: number;
  comentarios: number;
  denuncias: number;
  criadaEm: number;
}

export interface Comentario {
  id: string;
  autorId: string;
  apelido: string;
  texto: string;
  criadoEm: number;
}

function erro(e: unknown, extras: Record<string, string> = {}): never {
  const texto = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e);
  for (const [trecho, msg] of Object.entries(extras)) if (texto.includes(trecho)) throw new Error(msg);
  if (/anonymous.*disabled|Anonymous sign-ins are disabled/i.test(texto))
    throw new Error("O login por apelido está desligado no servidor. Peça ao administrador para ligar o login anônimo no Supabase.");
  throw new Error(mensagemDeErro(e));
}

const urlDe = (caminho: string) => supabase.storage.from(PASTA).getPublicUrl(caminho).data.publicUrl;

// ---------- Sessão e apelido ----------

/** Garante que a pessoa tem uma sessão (anônima, se não estiver logada) e devolve o id dela. */
export async function garantirSessao(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session.user.id;
  const { data: novo, error } = await supabase.auth.signInAnonymously();
  if (error || !novo.user) erro(error ?? new Error("Não foi possível entrar."));
  return novo.user.id;
}

export async function idAtual(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

export async function meuApelido(): Promise<string | null> {
  const id = await idAtual();
  if (!id) return null;
  const { data, error } = await supabase.from("perfis").select("apelido").eq("user_id", id).maybeSingle();
  if (error) erro(error);
  return data?.apelido ?? null;
}

export const APELIDO_VALIDO = /^[A-Za-z0-9_.À-ÿ]{3,20}$/;

export async function definirApelido(apelido: string): Promise<string> {
  const limpo = apelido.trim();
  if (!APELIDO_VALIDO.test(limpo)) throw new Error("Use de 3 a 20 letras, números, ponto ou _ (sem espaços).");
  const id = await garantirSessao();
  const { error } = await supabase.from("perfis").upsert({ user_id: id, apelido: limpo });
  if (error) erro(error, { perfis_apelido_unico: "Esse apelido já está em uso. Escolha outro.", "duplicate key": "Esse apelido já está em uso. Escolha outro." });
  return limpo;
}

// ---------- Publicar ----------

export async function publicar(dados: { video: Blob; capa?: Blob | null; cenaId: string; cenaTitulo: string; papeis: string[]; duracaoMs: number }): Promise<string> {
  if (dados.video.size > LIMITE_BYTES) throw new Error("O vídeo ficou grande demais para a galeria (limite de 15 MB). Use uma cena mais curta.");
  const id = await garantirSessao();
  const base = `${id}/${Date.now().toString(36)}`;
  const tipo = dados.video.type.includes("mp4") ? "video/mp4" : "video/webm";
  const videoPath = `${base}.${tipo === "video/mp4" ? "mp4" : "webm"}`;
  const enviados: string[] = [];
  try {
    const v = await supabase.storage.from(PASTA).upload(videoPath, dados.video, { contentType: tipo, cacheControl: "31536000" });
    if (v.error) erro(v.error);
    enviados.push(videoPath);
    let capaPath: string | null = null;
    if (dados.capa) {
      capaPath = `${base}.jpg`;
      const c = await supabase.storage.from(PASTA).upload(capaPath, dados.capa, { contentType: "image/jpeg", cacheControl: "31536000" });
      if (c.error) capaPath = null;
      else enviados.push(capaPath);
    }
    const { data, error } = await supabase
      .from("publicacoes")
      .insert({ cena_id: dados.cenaId, cena_titulo: dados.cenaTitulo, papeis: dados.papeis, video_path: videoPath, capa_path: capaPath, duracao_ms: Math.round(dados.duracaoMs) })
      .select("id")
      .single();
    if (error) erro(error, { "row-level security": "Escolha um apelido antes de publicar." });
    return data.id as string;
  } catch (e) {
    if (enviados.length) await supabase.storage.from(PASTA).remove(enviados);
    throw e;
  }
}

// ---------- Feed ----------

interface Linha {
  id: string;
  autor_id: string;
  cena_id: string | null;
  cena_titulo: string;
  papeis: string[];
  video_path: string;
  capa_path: string | null;
  duracao_ms: number;
  oculta: boolean;
  curtidas: number;
  descurtidas: number;
  comentarios: number;
  denuncias: number;
  criada_em: string;
  perfis: { apelido: string } | null;
}

function paraPublicacao(l: Linha): Publicacao {
  return {
    id: l.id,
    autorId: l.autor_id,
    apelido: l.perfis?.apelido ?? "anônimo",
    cenaId: l.cena_id,
    cenaTitulo: l.cena_titulo,
    papeis: l.papeis ?? [],
    video: urlDe(l.video_path),
    capa: l.capa_path ? urlDe(l.capa_path) : null,
    videoPath: l.video_path,
    capaPath: l.capa_path,
    duracaoMs: l.duracao_ms,
    oculta: l.oculta,
    curtidas: l.curtidas,
    descurtidas: l.descurtidas,
    comentarios: l.comentarios,
    denuncias: l.denuncias,
    criadaEm: Date.parse(l.criada_em),
  };
}

const CAMPOS = "*, perfis(apelido)";

/** Publicações visíveis, das mais novas para as mais antigas (paginado por data). */
export async function listarFeed(opcoes: { antesDe?: number; limite?: number } = {}): Promise<Publicacao[]> {
  let q = supabase.from("publicacoes").select(CAMPOS).eq("oculta", false).order("criada_em", { ascending: false }).limit(opcoes.limite ?? 8);
  if (opcoes.antesDe) q = q.lt("criada_em", new Date(opcoes.antesDe).toISOString());
  const { data, error } = await q;
  if (error) erro(error);
  return (data as Linha[]).map(paraPublicacao);
}

export async function obterPublicacao(id: string): Promise<Publicacao | null> {
  const { data, error } = await supabase.from("publicacoes").select(CAMPOS).eq("id", id).maybeSingle();
  if (error) erro(error);
  return data ? paraPublicacao(data as Linha) : null;
}

/** Para o administrador: todas, inclusive ocultas, com as mais denunciadas primeiro. */
export async function listarParaModeracao(): Promise<Publicacao[]> {
  const { data, error } = await supabase.from("publicacoes").select(CAMPOS).order("denuncias", { ascending: false }).order("criada_em", { ascending: false }).limit(100);
  if (error) erro(error);
  return (data as Linha[]).map(paraPublicacao);
}

// ---------- Reações, comentários e denúncias ----------

export async function minhasReacoes(ids: string[]): Promise<Record<string, 1 | -1>> {
  const eu = await idAtual();
  if (!eu || !ids.length) return {};
  const { data, error } = await supabase.from("reacoes").select("publicacao_id, valor").eq("user_id", eu).in("publicacao_id", ids);
  if (error) return {};
  return Object.fromEntries((data as { publicacao_id: string; valor: 1 | -1 }[]).map((r) => [r.publicacao_id, r.valor]));
}

/** valor 1 = 👍, -1 = 👎, 0 = tirar a reação. Devolve os contadores atualizados. */
export async function reagir(id: string, valor: 1 | -1 | 0): Promise<{ curtidas: number; descurtidas: number }> {
  const eu = await garantirSessao();
  const r =
    valor === 0
      ? await supabase.from("reacoes").delete().eq("publicacao_id", id).eq("user_id", eu)
      : await supabase.from("reacoes").upsert({ publicacao_id: id, user_id: eu, valor });
  if (r.error) erro(r.error);
  const { data } = await supabase.from("publicacoes").select("curtidas, descurtidas").eq("id", id).maybeSingle();
  return { curtidas: data?.curtidas ?? 0, descurtidas: data?.descurtidas ?? 0 };
}

export async function listarComentarios(id: string): Promise<Comentario[]> {
  const { data, error } = await supabase.from("comentarios").select("id, autor_id, texto, criado_em, perfis(apelido)").eq("publicacao_id", id).order("criado_em", { ascending: true });
  if (error) erro(error);
  return (data as unknown as { id: string; autor_id: string; texto: string; criado_em: string; perfis: { apelido: string } | null }[]).map((c) => ({
    id: c.id,
    autorId: c.autor_id,
    apelido: c.perfis?.apelido ?? "anônimo",
    texto: c.texto,
    criadoEm: Date.parse(c.criado_em),
  }));
}

export async function comentar(id: string, texto: string) {
  const limpo = texto.trim().slice(0, 300);
  if (!limpo) return;
  await garantirSessao();
  const { error } = await supabase.from("comentarios").insert({ publicacao_id: id, texto: limpo });
  if (error) erro(error, { "row-level security": "Escolha um apelido antes de comentar." });
}

export async function apagarComentario(id: string) {
  const { error } = await supabase.from("comentarios").delete().eq("id", id);
  if (error) erro(error);
}

export async function denunciar(id: string): Promise<"ok" | "ja"> {
  await garantirSessao();
  const { error } = await supabase.from("denuncias").insert({ publicacao_id: id });
  if (error) {
    if (/duplicate key|denuncias_pkey/.test(error.message)) return "ja";
    erro(error);
  }
  return "ok";
}

// ---------- Moderação ----------

export async function ocultarPublicacao(id: string, oculta: boolean) {
  const { error } = await supabase.from("publicacoes").update({ oculta }).eq("id", id);
  if (error) erro(error);
}

export async function apagarPublicacao(p: Publicacao) {
  const { error } = await supabase.from("publicacoes").delete().eq("id", p.id);
  if (error) erro(error);
  await supabase.storage.from(PASTA).remove([p.videoPath, ...(p.capaPath ? [p.capaPath] : [])]);
}

export function tempoAtras(ts: number): string {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return "agora";
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  const d = Math.floor(s / 86400);
  if (d < 30) return `há ${d} ${d === 1 ? "dia" : "dias"}`;
  return new Date(ts).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}
