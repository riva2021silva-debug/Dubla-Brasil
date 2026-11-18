// Endereço e chave PÚBLICA do servidor (Supabase). A chave publishable é feita para ficar no app:
// quem protege os dados são as permissões do banco (ver supabase/esquema.sql).
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "https://gevjaroxwmlsoghfgqgd.supabase.co";
export const SUPABASE_CHAVE = import.meta.env.VITE_SUPABASE_CHAVE ?? "sb_publishable_vQqhM1-lGzdQ5l_VhNp7DQ_naM95OnV";

// Página de pagamento da assinatura Premium (R$ 19,90/mês). Vazio = botão "Assinar" mostra "em breve".
export const LINK_ASSINATURA: string = "https://pay.cakto.com.br/mtt98bn_1338782";
