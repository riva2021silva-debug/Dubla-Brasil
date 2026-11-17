// Acesso de administrador protegido por PIN, guardado (como hash) só neste aparelho.
import { useEffect, useState } from "react";

const CHAVE_PIN = "dubla-brasil:admin-pin";
const CHAVE_SESSAO = "dubla-brasil:admin-aberto";
const ouvintes = new Set<() => void>();

async function hash(pin: string): Promise<string> {
  const dados = new TextEncoder().encode(`dubla-brasil:${pin}`);
  const h = await crypto.subtle.digest("SHA-256", dados);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function ler(chave: string, armazenamento: Storage): string | null {
  try {
    return armazenamento.getItem(chave);
  } catch {
    return null;
  }
}

function gravar(chave: string, valor: string | null, armazenamento: Storage) {
  try {
    if (valor === null) armazenamento.removeItem(chave);
    else armazenamento.setItem(chave, valor);
  } catch {
    /* armazenamento indisponível */
  }
  ouvintes.forEach((f) => f());
}

export const temPin = () => ler(CHAVE_PIN, localStorage) !== null;
export const adminAberto = () => ler(CHAVE_SESSAO, sessionStorage) === "1";

export async function criarPin(pin: string) {
  gravar(CHAVE_PIN, await hash(pin), localStorage);
  gravar(CHAVE_SESSAO, "1", sessionStorage);
}

export async function entrar(pin: string): Promise<boolean> {
  const ok = (await hash(pin)) === ler(CHAVE_PIN, localStorage);
  if (ok) gravar(CHAVE_SESSAO, "1", sessionStorage);
  return ok;
}

export async function trocarPin(atual: string, novo: string): Promise<boolean> {
  if ((await hash(atual)) !== ler(CHAVE_PIN, localStorage)) return false;
  gravar(CHAVE_PIN, await hash(novo), localStorage);
  return true;
}

export const sair = () => gravar(CHAVE_SESSAO, null, sessionStorage);

export function useAdmin() {
  const [estado, setEstado] = useState(() => ({ aberto: adminAberto(), temPin: temPin() }));
  useEffect(() => {
    const f = () => setEstado({ aberto: adminAberto(), temPin: temPin() });
    ouvintes.add(f);
    return () => void ouvintes.delete(f);
  }, []);
  return estado;
}
