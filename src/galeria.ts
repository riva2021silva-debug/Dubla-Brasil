// Galeria de dubs: apelido (login anônimo), publicar, reagir, comentar, denunciar e moderar.
import { mensagemDeErro, supabase } from "./nuvem";

const PASTA = "dubs";
/** Limite de cada vídeo da galeria (igual ao da pasta "dubs" no Supabase). */
export const LIMITE_BYTES = 15 * 1024 * 1024;

export interface Publicacao {
  id: string;
  autorId: string;
  apelido: string;
  /** Foto do perfil do autor (ou null: mostra a inicial). */
  autorFoto: string | null;
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
  /** Dueto: id do dub original que esta pessoa "dublou junto" (e o apelido de quem fez o original). */
  duetoDe: string | null;
  duetoApelido: string | null;
}

export interface Comentario {
  id: string;
  autorId: string;
  apelido: string;
  foto: string | null;
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

export interface MeuPerfil {
  apelido: string | null;
  foto: string | null;
  fotoPath: string | null;
}

export async function meuPerfil(): Promise<MeuPerfil> {
  const id = await idAtual();
  if (!id) return { apelido: null, foto: null, fotoPath: null };
  const { data, error } = await comPerfil((perfis) =>
    supabase.from("perfis").select(perfis.replace(/^perfis\(|\)$/g, "")).eq("user_id", id).maybeSingle(),
  );
  if (error) erro(error);
  const d = data as { apelido: string; foto_path?: string | null } | null;
  return { apelido: d?.apelido ?? null, foto: d?.foto_path ? urlDe(d.foto_path) : null, fotoPath: d?.foto_path ?? null };
}

/** Recorta no meio (quadrado), diminui para 320×320 e salva em JPEG. */
async function prepararFoto(arquivo: Blob): Promise<Blob> {
  const img = await createImageBitmap(arquivo, { imageOrientation: "from-image" } as ImageBitmapOptions).catch(() => createImageBitmap(arquivo));
  const lado = Math.min(img.width, img.height);
  const tela = document.createElement("canvas");
  tela.width = tela.height = 320;
  tela.getContext("2d")!.drawImage(img, (img.width - lado) / 2, (img.height - lado) / 2, lado, lado, 0, 0, 320, 320);
  img.close?.();
  return new Promise((ok, falha) => tela.toBlob((b) => (b ? ok(b) : falha(new Error("Não foi possível ler esta imagem."))), "image/jpeg", 0.86));
}

/** Troca a foto do perfil (precisa já ter apelido). Devolve o endereço da foto nova. */
export async function definirFotoPerfil(arquivo: Blob): Promise<string> {
  if (!comFoto) throw new Error("A foto de perfil ainda não foi ativada no servidor (arquivo perfil.sql).");
  const atual = await meuPerfil();
  if (!atual.apelido) throw new Error("Escolha um apelido antes de colocar a foto.");
  const id = await garantirSessao();
  const foto = await prepararFoto(arquivo);
  const caminho = `${id}/avatar-${Date.now().toString(36)}.jpg`;
  const up = await supabase.storage.from(PASTA).upload(caminho, foto, { contentType: "image/jpeg", cacheControl: "31536000" });
  if (up.error) erro(up.error);
  const { error } = await supabase.from("perfis").update({ foto_path: caminho }).eq("user_id", id);
  if (error) {
    await supabase.storage.from(PASTA).remove([caminho]);
    if (semColunaFoto(error)) throw new Error("A foto de perfil ainda não foi ativada no servidor (arquivo perfil.sql).");
    erro(error);
  }
  if (atual.fotoPath) await supabase.storage.from(PASTA).remove([atual.fotoPath]);
  return urlDe(caminho);
}

export async function removerFotoPerfil() {
  const atual = await meuPerfil();
  const id = await idAtual();
  if (!id || !atual.fotoPath) return;
  const { error } = await supabase.from("perfis").update({ foto_path: null }).eq("user_id", id);
  if (error) erro(error);
  await supabase.storage.from(PASTA).remove([atual.fotoPath]);
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

export async function publicar(dados: { video: Blob; capa?: Blob | null; cenaId: string; cenaTitulo: string; papeis: string[]; duracaoMs: number; duetoDe?: string | null }): Promise<string> {
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
    const linha = { cena_id: dados.cenaId, cena_titulo: dados.cenaTitulo, papeis: dados.papeis, video_path: videoPath, capa_path: capaPath, duracao_ms: Math.round(dados.duracaoMs) };
    const inserir = (extra: Record<string, unknown>) => supabase.from("publicacoes").insert({ ...linha, ...extra }).select("id").single();
    let { data, error } = await inserir(dados.duetoDe ? { dueto_de: dados.duetoDe } : {});
    // Servidor ainda sem o dueto (arquivo dueto-e-notificacoes.sql): publica normal, sem perder o vídeo.
    if (error && dados.duetoDe && (error.code === "PGRST204" || error.code === "42703" || /dueto_de/.test(error.message))) ({ data, error } = await inserir({}));
    if (error || !data) erro(error, { "row-level security": "Escolha um apelido antes de publicar." });
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
  dueto_de?: string | null;
  dueto_apelido?: string | null;
  perfis: { apelido: string; foto_path?: string | null } | null;
}

function paraPublicacao(l: Linha): Publicacao {
  return {
    id: l.id,
    autorId: l.autor_id,
    apelido: l.perfis?.apelido ?? "anônimo",
    autorFoto: l.perfis?.foto_path ? urlDe(l.perfis.foto_path) : null,
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
    duetoDe: l.dueto_de ?? null,
    duetoApelido: l.dueto_apelido ?? null,
  };
}

// Foto do perfil (coluna perfis.foto_path, de supabase/perfil.sql). Enquanto o SQL não foi rodado, segue só com o apelido.
let comFoto = true;
const perfisSel = () => (comFoto ? "perfis(apelido, foto_path)" : "perfis(apelido)");
const semColunaFoto = (e: { message?: string; code?: string } | null) => !!e && comFoto && (e.code === "42703" || /foto_path/.test(e.message ?? ""));
/** Faz a consulta com a foto; se a coluna ainda não existir no servidor, refaz sem ela. */
async function comPerfil<T>(consulta: (perfis: string) => PromiseLike<{ data: T; error: { message?: string; code?: string } | null }>) {
  let r = await consulta(perfisSel());
  if (semColunaFoto(r.error)) {
    comFoto = false;
    r = await consulta(perfisSel());
  }
  return r;
}

/** Publicações visíveis, das mais novas para as mais antigas (paginado por data). */
export async function listarFeed(opcoes: { antesDe?: number; limite?: number } = {}): Promise<Publicacao[]> {
  const { data, error } = await comPerfil((perfis) => {
    let q = supabase.from("publicacoes").select(`*, ${perfis}`).eq("oculta", false).order("criada_em", { ascending: false }).limit(opcoes.limite ?? 8);
    if (opcoes.antesDe) q = q.lt("criada_em", new Date(opcoes.antesDe).toISOString());
    return q;
  });
  if (error) erro(error);
  return (data as unknown as Linha[]).map(paraPublicacao);
}

export async function obterPublicacao(id: string): Promise<Publicacao | null> {
  const { data, error } = await comPerfil((perfis) => supabase.from("publicacoes").select(`*, ${perfis}`).eq("id", id).maybeSingle());
  if (error) erro(error);
  return data ? paraPublicacao(data as unknown as Linha) : null;
}

/** Para o administrador: todas, inclusive ocultas, com as mais denunciadas primeiro. */
export async function listarParaModeracao(): Promise<Publicacao[]> {
  const { data, error } = await comPerfil((perfis) =>
    supabase.from("publicacoes").select(`*, ${perfis}`).order("denuncias", { ascending: false }).order("criada_em", { ascending: false }).limit(100),
  );
  if (error) erro(error);
  return (data as unknown as Linha[]).map(paraPublicacao);
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
  const { data, error } = await comPerfil((perfis) =>
    supabase.from("comentarios").select(`id, autor_id, texto, criado_em, ${perfis}`).eq("publicacao_id", id).order("criado_em", { ascending: true }),
  );
  if (error) erro(error);
  return (data as unknown as { id: string; autor_id: string; texto: string; criado_em: string; perfis: { apelido: string; foto_path?: string | null } | null }[]).map((c) => ({
    id: c.id,
    autorId: c.autor_id,
    apelido: c.perfis?.apelido ?? "anônimo",
    foto: c.perfis?.foto_path ? urlDe(c.perfis.foto_path) : null,
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
