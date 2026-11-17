// Armazenamento local no navegador (IndexedDB). Nada sai do computador da pessoa.
import type { Cena, Dub, FonteMidia } from "./tipos";

const NOME_DB = "dubla-brasil";
const VERSAO = 1;

let conexao: Promise<IDBDatabase> | null = null;

function abrir(): Promise<IDBDatabase> {
  if (conexao) return conexao;
  conexao = new Promise((resolve, reject) => {
    const req = indexedDB.open(NOME_DB, VERSAO);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("cenas")) db.createObjectStore("cenas", { keyPath: "id" });
      if (!db.objectStoreNames.contains("dubs")) db.createObjectStore("dubs", { keyPath: "id" });
      if (!db.objectStoreNames.contains("midias")) db.createObjectStore("midias");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return conexao;
}

async function operar<T>(
  loja: string,
  modo: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest,
): Promise<T> {
  const db = await abrir();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(loja, modo);
    const req = fn(tx.objectStore(loja));
    tx.oncomplete = () => resolve(req.result as T);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const db = {
  listarCenas: () => operar<Cena[]>("cenas", "readonly", (s) => s.getAll()),
  obterCena: (id: string) => operar<Cena | undefined>("cenas", "readonly", (s) => s.get(id)),
  salvarCena: (c: Cena) => operar<IDBValidKey>("cenas", "readwrite", (s) => s.put(c)),
  excluirCena: (id: string) => operar<undefined>("cenas", "readwrite", (s) => s.delete(id)),

  listarDubs: () => operar<Dub[]>("dubs", "readonly", (s) => s.getAll()),
  obterDub: (id: string) => operar<Dub | undefined>("dubs", "readonly", (s) => s.get(id)),
  salvarDub: (d: Dub) => operar<IDBValidKey>("dubs", "readwrite", (s) => s.put(d)),
  excluirDub: (id: string) => operar<undefined>("dubs", "readwrite", (s) => s.delete(id)),

  salvarMidia: (chave: string, b: Blob) => operar<IDBValidKey>("midias", "readwrite", (s) => s.put(b, chave)),
  obterMidia: (chave: string) => operar<Blob | undefined>("midias", "readonly", (s) => s.get(chave)),
  excluirMidia: (chave: string) => operar<undefined>("midias", "readwrite", (s) => s.delete(chave)),
};

/** Devolve uma URL tocável para a mídia (lembre de liberar com URL.revokeObjectURL se for blob:). */
export async function urlDaMidia(f: FonteMidia): Promise<string> {
  if (f.tipo === "url") return f.url;
  const blob = await db.obterMidia(f.chave);
  if (!blob) throw new Error("Arquivo da cena não encontrado neste navegador.");
  return URL.createObjectURL(blob);
}

export async function blobDaMidia(f: FonteMidia): Promise<Blob> {
  if (f.tipo === "blob") {
    const blob = await db.obterMidia(f.chave);
    if (!blob) throw new Error("Arquivo da cena não encontrado neste navegador.");
    return blob;
  }
  const r = await fetch(f.url);
  if (!r.ok) throw new Error(`Não foi possível baixar ${f.url}`);
  return r.blob();
}

export async function excluirCenaCompleta(c: Cena) {
  for (const f of [c.video, c.fundo]) if (f?.tipo === "blob") await db.excluirMidia(f.chave);
  const dubs = await db.listarDubs();
  for (const d of dubs) if (d.cenaId === c.id) await db.excluirDub(d.id);
  await db.excluirCena(c.id);
}
