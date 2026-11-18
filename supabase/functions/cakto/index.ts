// Dubla Brasil AI — recebe os avisos (webhooks) da Cakto e libera/encerra o Premium.
// Cole este arquivo inteiro no Supabase: Edge Functions → Deploy a new function → Via Editor → nome "cakto".
// Depois: desligue "Enforce JWT verification" (a Cakto não tem login no Supabase) e crie o segredo
// CAKTO_SECRET (Edge Functions → Secrets) com o mesmo valor do "secret" do webhook na Cakto.
// Não precisa de mais nada: SUPABASE_URL e a chave de serviço já existem dentro da função.

const LIBERAR = ["purchase_approved", "subscription_created", "subscription_renewed", "subscription_renewal_approved", "renewal_approved"];
const ENCERRAR = ["refund", "refunded", "chargeback", "purchase_refunded", "purchase_chargeback"];
const CANCELAR = ["subscription_canceled", "subscription_cancelled", "subscription_renewal_refused"];

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" ? (v as Json) : {});
const txt = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

/** Lê o essencial do aviso, aceitando pequenas variações no formato. */
export function lerAviso(corpo: Json) {
  const dados = obj(corpo.data ?? corpo.dados ?? corpo);
  const cliente = obj(dados.customer ?? dados.cliente ?? corpo.customer ?? dados.buyer);
  const evento = txt(corpo.event ?? corpo.evento ?? corpo.type ?? dados.event).toLowerCase();
  const email = txt(cliente.email ?? dados.email ?? dados.customer_email ?? corpo.email).trim().toLowerCase();
  const referencia = txt(dados.refId ?? dados.id ?? dados.order_id ?? corpo.id) || null;
  const segredo = txt(corpo.secret ?? corpo.segredo);
  const acao = LIBERAR.includes(evento) ? "liberar" : ENCERRAR.includes(evento) ? "encerrar" : CANCELAR.includes(evento) ? "cancelar" : "registrar";
  return { evento, email, referencia, segredo, acao };
}

/** Comparação que não vaza o segredo pelo tempo de resposta. */
function iguais(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function tratar(req: Request, env: (k: string) => string | undefined, buscar: typeof fetch = fetch): Promise<Response> {
  if (req.method !== "POST") return new Response("Dubla Brasil: webhook da Cakto ativo.", { status: 200 });
  let corpo: Json;
  try {
    corpo = obj(await req.json());
  } catch {
    return new Response("JSON inválido", { status: 400 });
  }
  const aviso = lerAviso(corpo);
  const esperado = env("CAKTO_SECRET") ?? "";
  // O segredo pode vir no corpo (campo "secret") ou no endereço do webhook (?segredo=...).
  const recebido = aviso.segredo || new URL(req.url).searchParams.get("segredo") || req.headers.get("x-cakto-secret") || "";
  const base = env("SUPABASE_URL") ?? "";
  const chave = env("SUPABASE_SERVICE_ROLE_KEY") ?? env("SUPABASE_SECRET_KEY") ?? "";
  const cabecalhos: Record<string, string> = { apikey: chave, "Content-Type": "application/json" };
  if (chave.startsWith("eyJ")) cabecalhos.Authorization = `Bearer ${chave}`;
  // Não guarda o segredo no registro.
  const { secret: _s, segredo: _g, ...semSegredo } = corpo;
  const rpc = (nome: string, args: Json) => buscar(`${base}/rest/v1/rpc/${nome}`, { method: "POST", headers: cabecalhos, body: JSON.stringify(args) });

  if (!esperado || !iguais(recebido, esperado)) {
    await rpc("cakto_recusado", { p_evento: aviso.evento, p_email: aviso.email, p_corpo: semSegredo }).catch(() => {});
    return new Response("segredo inválido", { status: 401 });
  }
  const r = await rpc("cakto_aplicar", { p_email: aviso.email, p_acao: aviso.acao, p_referencia: aviso.referencia, p_evento: aviso.evento, p_corpo: semSegredo });
  if (!r.ok) return new Response(`erro no banco: ${await r.text()}`, { status: 500 });
  return new Response(JSON.stringify({ ok: true, acao: aviso.acao, resultado: await r.json() }), { status: 200, headers: { "Content-Type": "application/json" } });
}

// No Supabase (Deno) a função começa aqui.
const deno = (globalThis as { Deno?: { serve(h: (r: Request) => Promise<Response>): void; env: { get(k: string): string | undefined } } }).Deno;
if (deno) deno.serve((req) => tratar(req, (k) => deno.env.get(k)));
