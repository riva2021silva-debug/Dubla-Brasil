// Rascunho do editor de cenas: tudo o que o administrador muda fica guardado no aparelho (IndexedDB),
// inclusive o vídeo escolhido, para retomar a edição se sair da tela, trocar de app ou o celular fechar o app.
// O vídeo e a trilha (grandes) ficam à parte e só são regravados quando mudam.
import { db } from "./db";
import type { Cena } from "./tipos";

export interface Rascunho {
  chave: string;
  salvoEm: number;
  cena: Cena;
  /** Há vídeo/trilha novos guardados à parte (ainda não enviados ao servidor)? "removido" = a trilha foi tirada. */
  temVideo: boolean;
  videoNome: string | null;
  fundo: "novo" | "removido" | null;
  fundoNome: string | null;
  novosRostos: Record<string, Blob | null>;
  novaCapa: Blob | null;
}

/** Cena nova usa a chave "nova"; cena existente usa o próprio id. */
export const chaveDoRascunho = (id: string | undefined) => id ?? "nova";
const chaveArquivo = (chave: string, tipo: "video" | "fundo") => `rascunho:${chave}:${tipo}`;

export const lerRascunho = (chave: string) => db.obterRascunho<Rascunho>(chave).catch(() => undefined);
export const guardarRascunho = (r: Rascunho) => db.salvarRascunho(r.chave, r).catch(() => {});

export const guardarArquivo = (chave: string, tipo: "video" | "fundo", b: Blob | null) =>
  (b ? db.salvarMidia(chaveArquivo(chave, tipo), b) : db.excluirMidia(chaveArquivo(chave, tipo))).catch(() => {});
export const lerArquivo = (chave: string, tipo: "video" | "fundo") => db.obterMidia(chaveArquivo(chave, tipo)).catch(() => undefined);

export async function apagarRascunho(chave: string) {
  await Promise.all([
    db.excluirRascunho(chave).catch(() => {}),
    db.excluirMidia(chaveArquivo(chave, "video")).catch(() => {}),
    db.excluirMidia(chaveArquivo(chave, "fundo")).catch(() => {}),
  ]);
}

export const quandoFoi = (ms: number) =>
  new Date(ms).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Arquivo de volta (o IndexedDB pode devolver Blob; o envio usa o nome). */
export const comoArquivo = (b: Blob, nome: string | null, padrao: string) =>
  b instanceof File ? b : new File([b], nome || padrao, { type: b.type });
