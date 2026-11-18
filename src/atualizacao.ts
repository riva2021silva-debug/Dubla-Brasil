// Aviso de atualização: o site publica /versao.json; o app compara com a versão dele e avisa quando há uma nova.
import { Capacitor } from "@capacitor/core";

declare const __VERSAO_APP__: string;
declare const __CODIGO_APP__: number;

export const VERSAO_APP = __VERSAO_APP__;
export const CODIGO_APP = __CODIGO_APP__;

/** Endereço onde o site publica a versão mais nova (o app instalado lê daqui). */
const URL_SITE = "https://dublabr.netlify.app/";

export interface VersaoPublicada {
  versao: string;
  codigo: number;
  data?: string;
  novidades: string[];
  apk?: string;
}

export const noAppInstalado = () => Capacitor.isNativePlatform();
export const plataforma = () => Capacitor.getPlatform(); // "android" | "ios" | "web"

/** Busca a versão publicada (sem cache). Devolve null se estiver sem internet. */
export async function versaoPublicada(): Promise<VersaoPublicada | null> {
  const base = noAppInstalado() ? URL_SITE : "./";
  try {
    const r = await fetch(`${base}versao.json?t=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) return null;
    const v = (await r.json()) as VersaoPublicada;
    return typeof v.codigo === "number" ? v : null;
  } catch {
    return null;
  }
}

const CHAVE_ADIADA = "dubla-brasil:atualizacao-adiada";
const CHAVE_VISTA = "dubla-brasil:novidades-vistas";

const ler = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const gravar = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* sem armazenamento: só não lembra */
  }
};

/** "Depois": não insiste nesta versão por 12 horas. */
export function adiar(codigo: number) {
  gravar(CHAVE_ADIADA, JSON.stringify({ codigo, ate: Date.now() + 12 * 3600e3 }));
}
export function estaAdiada(codigo: number) {
  try {
    const a = JSON.parse(ler(CHAVE_ADIADA) ?? "null") as { codigo: number; ate: number } | null;
    return !!a && a.codigo >= codigo && a.ate > Date.now();
  } catch {
    return false;
  }
}

/** Mostra "o que há de novo" uma vez depois de atualizar. */
export function primeiraVezNestaVersao(): boolean {
  const vista = Number(ler(CHAVE_VISTA) ?? "0");
  if (vista >= CODIGO_APP) return false;
  gravar(CHAVE_VISTA, String(CODIGO_APP));
  return vista > 0; // na primeira instalação não mostra
}

/** Abre um link fora do app (navegador do celular). */
export async function abrirFora(url: string) {
  if (noAppInstalado()) {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url });
  } else window.open(url, "_blank", "noopener");
}

/** Atualiza: no site recarrega; no Android baixa o APK novo. */
export async function atualizar(v: VersaoPublicada) {
  if (plataforma() === "android" && v.apk) return abrirFora(v.apk);
  if (!noAppInstalado()) {
    // Recarrega buscando tudo de novo.
    const u = new URL(location.href);
    u.searchParams.set("v", String(v.codigo));
    location.replace(u.toString());
  }
}
