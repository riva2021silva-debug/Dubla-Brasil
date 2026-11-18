// Notificações no app: "@Rafa curtiu seu dub", "@Ana comentou…", "@Beto dublou junto com você".
// Quem cria os avisos é o servidor (gatilhos em supabase/dueto-e-notificacoes.sql); o app só lê e marca como lidos.
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "./nuvem";
import { idAtual } from "./galeria";

export type TipoNotificacao = "curtida" | "comentario" | "dueto";

export interface Notificacao {
  id: string;
  tipo: TipoNotificacao;
  deApelido: string | null;
  publicacaoId: string | null;
  cenaTitulo: string | null;
  texto: string | null;
  lida: boolean;
  criadaEm: number;
}

/** Avisa a tela (sino do topo) que algo mudou. */
export const EVENTO_NOTIFICACOES = "dubla:notificacoes-mudaram";
const avisarMudanca = () => window.dispatchEvent(new Event(EVENTO_NOTIFICACOES));

/** Frase do aviso, sem o apelido (o apelido aparece em negrito na tela). */
export function frase(n: Notificacao): string {
  const cena = n.cenaTitulo ? ` de “${n.cenaTitulo}”` : "";
  if (n.tipo === "curtida") return `curtiu seu dub${cena}`;
  if (n.tipo === "comentario") return `comentou no seu dub${cena}`;
  return `dublou junto com você${n.cenaTitulo ? ` em “${n.cenaTitulo}”` : ""}`;
}

export const icone = (t: TipoNotificacao) => (t === "curtida" ? "👍" : t === "comentario" ? "💬" : "🎭");

export async function listarNotificacoes(): Promise<Notificacao[]> {
  if (!(await idAtual())) return [];
  const { data, error } = await supabase.from("notificacoes").select("*").order("criada_em", { ascending: false }).limit(60);
  if (error) {
    // Servidor ainda sem o arquivo dueto-e-notificacoes.sql: só não mostra avisos.
    if (/notificacoes/.test(error.message) || error.code === "42P01" || error.code === "PGRST205") return [];
    throw new Error(error.message);
  }
  const linhas = data as { id: string; tipo: TipoNotificacao; de: string | null; de_apelido: string | null; publicacao_id: string | null; cena_titulo: string | null; texto: string | null; lida: boolean; criada_em: string }[];
  // Apelido atual de quem mandou (a pessoa pode ter curtido antes de escolher o apelido, ou ter trocado depois).
  const ids = [...new Set(linhas.map((n) => n.de).filter((x): x is string => !!x))];
  const apelidos = new Map<string, string>();
  if (ids.length) {
    const { data: perfis } = await supabase.from("perfis").select("user_id, apelido").in("user_id", ids);
    for (const p of (perfis ?? []) as { user_id: string; apelido: string }[]) apelidos.set(p.user_id, p.apelido);
  }
  return linhas.map((n) => ({
    id: n.id,
    tipo: n.tipo,
    deApelido: (n.de && apelidos.get(n.de)) || n.de_apelido,
    publicacaoId: n.publicacao_id,
    cenaTitulo: n.cena_titulo,
    texto: n.texto,
    lida: n.lida,
    criadaEm: Date.parse(n.criada_em),
  }));
}

export async function contarNaoLidas(): Promise<number> {
  try {
    if (!(await idAtual())) return 0;
    const { count, error } = await supabase.from("notificacoes").select("id", { count: "exact", head: true }).eq("lida", false);
    return error ? 0 : (count ?? 0);
  } catch {
    return 0;
  }
}

export async function marcarTodasComoLidas() {
  const eu = await idAtual();
  if (!eu) return;
  await supabase.from("notificacoes").update({ lida: true }).eq("para", eu).eq("lida", false);
  avisarMudanca();
}

export async function marcarComoLida(id: string) {
  await supabase.from("notificacoes").update({ lida: true }).eq("id", id);
  avisarMudanca();
}

export async function limparNotificacoes() {
  const eu = await idAtual();
  if (!eu) return;
  await supabase.from("notificacoes").delete().eq("para", eu);
  avisarMudanca();
}

/** Quantos avisos não lidos (atualiza a cada minuto, ao trocar de tela, ao voltar para o app e quando algo muda). */
export function useNaoLidas(): number {
  const [n, setN] = useState(0);
  const { pathname } = useLocation();
  // Também confere ao trocar de tela (é uma consulta bem leve).
  useEffect(() => {
    avisarMudanca();
  }, [pathname]);
  useEffect(() => {
    let vivo = true;
    const contar = () => void contarNaoLidas().then((c) => vivo && setN(c));
    contar();
    const t = setInterval(contar, 60_000);
    const aoVoltar = () => {
      if (document.visibilityState === "visible") contar();
    };
    window.addEventListener(EVENTO_NOTIFICACOES, contar);
    document.addEventListener("visibilitychange", aoVoltar);
    const { data } = supabase.auth.onAuthStateChange(() => contar());
    return () => {
      vivo = false;
      clearInterval(t);
      window.removeEventListener(EVENTO_NOTIFICACOES, contar);
      document.removeEventListener("visibilitychange", aoVoltar);
      data.subscription.unsubscribe();
    };
  }, []);
  return n;
}
