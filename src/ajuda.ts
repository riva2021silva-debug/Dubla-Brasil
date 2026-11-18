// Ajuda: mensagens dos usuários para o administrador (supabase/cakto-e-ajuda.sql).
import { mensagemDeErro, supabase } from "./nuvem";
import { garantirSessao } from "./galeria";
import { VERSAO_APP, plataforma } from "./atualizacao";

export type TipoMensagem = "problema" | "duvida" | "pagamento" | "sugestao";
export type StatusMensagem = "nova" | "lida" | "resolvida";

export const TIPOS: { id: TipoMensagem; nome: string; emoji: string }[] = [
  { id: "problema", nome: "Algo não funciona", emoji: "🐞" },
  { id: "pagamento", nome: "Pagamento / Premium", emoji: "💳" },
  { id: "duvida", nome: "Dúvida", emoji: "❓" },
  { id: "sugestao", nome: "Sugestão", emoji: "💡" },
];

export interface Mensagem {
  id: string;
  user_id: string;
  tipo: TipoMensagem;
  texto: string;
  contato: string | null;
  aparelho: string | null;
  versao: string | null;
  status: StatusMensagem;
  resposta: string | null;
  criada_em: string;
  respondida_em: string | null;
}

function erro(e: { message?: string; code?: string }): never {
  if (/row-level security/i.test(e.message ?? "")) throw new Error("Você já mandou 5 mensagens hoje. Aguarde a resposta ou tente amanhã.");
  if (/check constraint/i.test(e.message ?? "")) throw new Error("Escreva um pouco mais (pelo menos 5 letras) e no máximo 2000.");
  throw new Error(mensagemDeErro(e));
}

/** Resumo do aparelho para ajudar a achar o problema (sem dados pessoais). */
function aparelho(): string {
  const ua = navigator.userAgent;
  const so = /Android [\d.]+/.exec(ua)?.[0] ?? /iPhone OS [\d_]+/.exec(ua)?.[0]?.replace(/_/g, ".") ?? /Windows NT [\d.]+|Mac OS X [\d_]+|Linux/.exec(ua)?.[0] ?? "";
  const nav = /(Chrome|Firefox|Safari|Edg)\/[\d]+/.exec(ua)?.[0] ?? "";
  return `${plataforma()} · ${so} · ${nav} · tela ${screen.width}x${screen.height}`.slice(0, 300);
}

export async function enviarMensagem(tipo: TipoMensagem, texto: string, contato: string) {
  await garantirSessao();
  const { error } = await supabase.from("mensagens_ajuda").insert({
    tipo,
    texto: texto.trim(),
    contato: contato.trim() || null,
    aparelho: aparelho(),
    versao: VERSAO_APP,
  });
  if (error) erro(error);
}

export async function minhasMensagens(): Promise<Mensagem[]> {
  const { data: s } = await supabase.auth.getSession();
  if (!s.session) return [];
  const { data, error } = await supabase
    .from("mensagens_ajuda")
    .select("*")
    .eq("user_id", s.session.user.id)
    .order("criada_em", { ascending: false })
    .limit(20);
  if (error) erro(error);
  return (data ?? []) as Mensagem[];
}

// ---------- Administrador ----------

export async function listarMensagens(filtro: "abertas" | "todas"): Promise<Mensagem[]> {
  let q = supabase.from("mensagens_ajuda").select("*").order("criada_em", { ascending: false }).limit(100);
  if (filtro === "abertas") q = q.in("status", ["nova", "lida"]);
  const { data, error } = await q;
  if (error) erro(error);
  return (data ?? []) as Mensagem[];
}

export async function contarNovas(): Promise<number> {
  const { count, error } = await supabase.from("mensagens_ajuda").select("id", { count: "exact", head: true }).eq("status", "nova");
  return error ? 0 : count ?? 0;
}

export async function atualizarMensagem(id: string, mudanca: { status?: StatusMensagem; resposta?: string | null }) {
  const extra = mudanca.resposta !== undefined ? { respondida_em: mudanca.resposta ? new Date().toISOString() : null } : {};
  const { error } = await supabase.from("mensagens_ajuda").update({ ...mudanca, ...extra }).eq("id", id);
  if (error) erro(error);
}

export async function apagarMensagem(id: string) {
  const { error } = await supabase.from("mensagens_ajuda").delete().eq("id", id);
  if (error) erro(error);
}

export interface AvisoPagamento {
  recebido_em: string;
  evento: string | null;
  email: string | null;
  valido: boolean;
  resultado: string | null;
}

export async function listarPagamentos(): Promise<AvisoPagamento[]> {
  const { data, error } = await supabase.rpc("admin_listar_pagamentos");
  if (error) erro(error);
  return (data ?? []) as AvisoPagamento[];
}

export const quando = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
