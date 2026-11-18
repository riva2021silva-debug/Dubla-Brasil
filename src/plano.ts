// Plano da pessoa: grátis (3 dublagens por dia, vídeo com marca d'água) ou Premium (R$ 19,90/mês).
// Quem decide é o servidor (supabase/assinatura.sql); o app só pergunta.
import { useEffect, useState } from "react";
import { mensagemDeErro, supabase } from "./nuvem";
import { garantirSessao } from "./galeria";
import { LINK_ASSINATURA } from "./nuvem-config";

export const PRECO = "R$ 19,90";
export const LIMITE_GRATIS = 3;

export interface Plano {
  carregando: boolean;
  premium: boolean;
  premiumAte: string | null;
  usadasHoje: number;
  limite: number;
  /** false quando o arquivo assinatura.sql ainda não foi rodado no Supabase (tudo liberado, com marca d'água). */
  ativo: boolean;
}

let atual: Plano = { carregando: true, premium: false, premiumAte: null, usadasHoje: 0, limite: LIMITE_GRATIS, ativo: false };
const ouvintes = new Set<(p: Plano) => void>();
const publicar = (p: Plano) => {
  atual = p;
  ouvintes.forEach((f) => f(p));
};

const naoAtivado = (e: { code?: string; message?: string }) =>
  e.code === "PGRST202" || e.code === "42883" || /Could not find the function|does not exist|schema cache/i.test(e.message ?? "");

export async function atualizarPlano(): Promise<Plano> {
  const { data, error } = await supabase.rpc("meu_plano");
  if (error) {
    publicar({ ...atual, carregando: false, ativo: !naoAtivado(error) && atual.ativo });
    return atual;
  }
  const d = data as { premium: boolean; premium_ate: string | null; usadas_hoje: number; limite: number };
  publicar({ carregando: false, premium: !!d.premium, premiumAte: d.premium_ate, usadasHoje: d.usadas_hoje ?? 0, limite: d.limite ?? LIMITE_GRATIS, ativo: true });
  return atual;
}

/** Conta uma dublagem nova. Devolve false quando a pessoa grátis já usou as 3 de hoje. */
export async function usarDublagem(): Promise<boolean> {
  await garantirSessao();
  const { data, error } = await supabase.rpc("usar_dublagem");
  if (error) {
    if (naoAtivado(error)) return true; // limite ainda não ativado no servidor
    throw new Error(mensagemDeErro(error));
  }
  const d = data as { ok: boolean; premium: boolean; usadas: number; limite: number };
  publicar({ ...atual, carregando: false, ativo: true, premium: d.premium, usadasHoje: d.premium ? atual.usadasHoje : d.usadas, limite: d.limite });
  return d.ok;
}

let iniciado = false;
export function usePlano(): Plano {
  const [p, setP] = useState(atual);
  useEffect(() => {
    ouvintes.add(setP);
    setP(atual);
    if (!iniciado) {
      iniciado = true;
      void atualizarPlano();
      supabase.auth.onAuthStateChange((evento) => {
        if (evento === "SIGNED_IN" || evento === "SIGNED_OUT" || evento === "USER_UPDATED") setTimeout(() => void atualizarPlano(), 0);
      });
    }
    return () => void ouvintes.delete(setP);
  }, []);
  return p;
}

// ---------- Conta (e-mail e senha), para a assinatura valer em qualquer celular ----------

export async function emailDaConta(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.email || null;
}

export async function entrarNaConta(email: string, senha: string) {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
  if (error) throw new Error(mensagemDeErro(error));
}

/** Cria a conta. Devolve "pronta" (já entrou) ou "confirmar" (o Supabase mandou um link de confirmação). */
export async function criarConta(email: string, senha: string): Promise<"pronta" | "confirmar"> {
  if (senha.length < 6) throw new Error("A senha precisa ter pelo menos 6 caracteres.");
  const { data, error } = await supabase.auth.signUp({ email: email.trim(), password: senha });
  if (error) {
    if (/already registered|already exists/i.test(error.message)) throw new Error("Já existe uma conta com esse e-mail. Use “Entrar”.");
    throw new Error(mensagemDeErro(error));
  }
  return data.session ? "pronta" : "confirmar";
}

/** Apaga a conta e tudo dela (exigência das lojas). Os vídeos da galeria saem antes, pela API de arquivos. */
export async function apagarMinhaConta() {
  const id = (await supabase.auth.getSession()).data.session?.user.id;
  if (!id) return;
  const { data } = await supabase.from("publicacoes").select("video_path,capa_path").eq("autor_id", id);
  const arquivos = (data ?? []).flatMap((p: { video_path: string; capa_path: string | null }) => [p.video_path, ...(p.capa_path ? [p.capa_path] : [])]);
  const { data: perfil } = await supabase.from("perfis").select("*").eq("user_id", id).maybeSingle();
  const foto = (perfil as { foto_path?: string | null } | null)?.foto_path;
  if (foto) arquivos.push(foto);
  if (arquivos.length) await supabase.storage.from("dubs").remove(arquivos);
  const { error } = await supabase.rpc("apagar_minha_conta");
  if (error) {
    if (naoAtivado(error)) throw new Error("A exclusão de conta ainda não foi ativada no servidor (arquivo conta.sql).");
    throw new Error(error.message.startsWith("A conta") ? error.message : mensagemDeErro(error));
  }
  await supabase.auth.signOut();
}

export async function sairDaConta() {
  await supabase.auth.signOut();
}

/** Link da página de pagamento (vem da plataforma escolhida), já com o e-mail da conta. */
export function linkDeCheckout(email: string): string | null {
  if (!LINK_ASSINATURA) return null;
  const u = new URL(LINK_ASSINATURA);
  u.searchParams.set("email", email);
  return u.toString();
}

// ---------- Administrador ----------

export interface Assinante {
  user_id: string;
  email: string | null;
  apelido: string | null;
  premium_ate: string;
  origem: string;
}

export async function listarAssinantes(): Promise<Assinante[]> {
  const { data, error } = await supabase.rpc("admin_listar_assinantes");
  if (error) throw new Error(mensagemDeErro(error));
  return (data ?? []) as Assinante[];
}

/** Dá dias de Premium (ou tira, com 0) para alguém pelo e-mail ou @apelido. */
export async function definirPremium(busca: string, dias: number): Promise<string | null> {
  const { data, error } = await supabase.rpc("admin_definir_premium", { busca, dias });
  if (error) throw new Error(error.message.startsWith("Ninguém") || error.message.startsWith("Só") ? error.message : mensagemDeErro(error));
  return (data as { premium_ate: string | null }).premium_ate;
}

export const dataBr = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "—");
