// Acesso de administrador: login com e-mail e senha do Supabase + confirmação no banco (tabela administradores).
import { useEffect, useState } from "react";
import { entrarComoAdmin, sairDoAdmin, souAdmin, supabase } from "./nuvem";

interface EstadoAdmin {
  carregando: boolean;
  aberto: boolean;
  email: string | null;
}

let atual: EstadoAdmin = { carregando: true, aberto: false, email: null };
const ouvintes = new Set<(e: EstadoAdmin) => void>();

function publicar(e: EstadoAdmin) {
  atual = e;
  ouvintes.forEach((f) => f(e));
}

async function conferir() {
  const { data } = await supabase.auth.getSession();
  const email = data.session?.user.email ?? null;
  publicar({ carregando: false, aberto: email ? await souAdmin() : false, email });
}

let iniciado = false;
function iniciar() {
  if (iniciado) return;
  iniciado = true;
  void conferir();
  supabase.auth.onAuthStateChange((evento) => {
    if (evento === "SIGNED_IN" || evento === "SIGNED_OUT" || evento === "USER_UPDATED") void conferir();
  });
}

export async function entrar(email: string, senha: string) {
  await entrarComoAdmin(email, senha);
  await conferir();
}

export async function sair() {
  await sairDoAdmin();
  publicar({ carregando: false, aberto: false, email: null });
}

export function useAdmin(): EstadoAdmin {
  const [estado, setEstado] = useState(atual);
  useEffect(() => {
    iniciar();
    ouvintes.add(setEstado);
    setEstado(atual);
    return () => void ouvintes.delete(setEstado);
  }, []);
  return estado;
}
