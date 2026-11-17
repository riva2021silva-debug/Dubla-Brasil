import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

export const novoId = () =>
  (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/-/g, "").slice(0, 16);

/** 83450 -> "1:23,4" */
export function formatarTempo(ms: number, decimos = true): string {
  const neg = ms < 0;
  const t = Math.abs(ms);
  const min = Math.floor(t / 60000);
  const seg = Math.floor((t % 60000) / 1000);
  const d = Math.floor((t % 1000) / 100);
  return `${neg ? "-" : ""}${min}:${String(seg).padStart(2, "0")}${decimos ? "," + d : ""}`;
}

export const CORES_PERSONAGEM = [
  "#22c55e", "#facc15", "#38bdf8", "#f472b6", "#fb923c", "#a78bfa", "#2dd4bf", "#f87171",
];

export function corLivre(usadas: string[]): string {
  return CORES_PERSONAGEM.find((c) => !usadas.includes(c)) ?? CORES_PERSONAGEM[usadas.length % CORES_PERSONAGEM.length];
}

export const IDIOMAS = [
  "Português (Brasil)", "Português (Portugal)", "Inglês", "Espanhol", "Francês", "Italiano",
  "Alemão", "Japonês", "Coreano", "Outro",
];

export function dataCurta(ts: number) {
  return new Date(ts).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * Salva um arquivo: no navegador, faz o download; no aplicativo (Android/iOS), grava no aparelho
 * e abre a janela de compartilhar (WhatsApp, Galeria, Arquivos, etc.).
 */
export async function baixarArquivo(blob: Blob, nome: string) {
  if (Capacitor.isNativePlatform()) {
    const dados = await blobParaBase64(blob);
    const salvo = await Filesystem.writeFile({ path: nome, data: dados, directory: Directory.Cache });
    await Share.share({ title: nome, files: [salvo.uri], dialogTitle: "Salvar ou compartilhar" });
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function nomeArquivo(texto: string) {
  return (
    texto
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "cena"
  );
}

/** Lê a duração (ms) de um arquivo de vídeo ou áudio. */
export function duracaoDoArquivo(url: string, tipo: "video" | "audio" = "video"): Promise<number> {
  return new Promise((resolve, reject) => {
    const el = document.createElement(tipo);
    el.preload = "metadata";
    el.onloadedmetadata = () => resolve(Math.round(el.duration * 1000));
    el.onerror = () => reject(new Error("Não foi possível ler este arquivo. Tente MP4 (H.264) ou WebM."));
    el.src = url;
  });
}

/** Converte legendas .srt em falas (sem personagem definido). */
export function lerSrt(texto: string): { texto: string; inicioMs: number; fimMs: number }[] {
  const tempo = (s: string) => {
    const m = s.trim().match(/(\d+):(\d+):(\d+)[,.](\d+)/);
    if (!m) return NaN;
    return ((+m[1] * 60 + +m[2]) * 60 + +m[3]) * 1000 + +m[4].padEnd(3, "0").slice(0, 3);
  };
  const blocos = texto.replace(/\r/g, "").split(/\n\s*\n/);
  const saida: { texto: string; inicioMs: number; fimMs: number }[] = [];
  for (const b of blocos) {
    const linhas = b.split("\n").filter((l) => l.trim() !== "");
    const i = linhas.findIndex((l) => l.includes("-->"));
    if (i < 0) continue;
    const [a, z] = linhas[i].split("-->");
    const inicioMs = tempo(a);
    const fimMs = tempo(z);
    if (Number.isNaN(inicioMs) || Number.isNaN(fimMs)) continue;
    saida.push({ texto: linhas.slice(i + 1).join(" ").replace(/<[^>]+>/g, ""), inicioMs, fimMs });
  }
  return saida;
}

function blobParaBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result).split(",")[1] ?? "");
    leitor.onerror = () => reject(leitor.error);
    leitor.readAsDataURL(blob);
  });
}

export const noAplicativo = () => Capacitor.isNativePlatform();

/** Tira uma foto (JPEG) do vídeo no instante indicado, para usar como capa da cena. */
export function gerarCapa(urlVideo: string, ms: number, largura = 640): Promise<Blob | null> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    const desistir = setTimeout(() => resolve(null), 8000);
    v.onloadeddata = () => {
      v.currentTime = Math.min(Math.max(0, ms / 1000), Math.max(0, v.duration - 0.1));
    };
    v.onseeked = () => {
      try {
        const alt = Math.round((v.videoHeight / Math.max(1, v.videoWidth)) * largura) || Math.round(largura * 0.5625);
        const tela = document.createElement("canvas");
        tela.width = largura;
        tela.height = alt;
        tela.getContext("2d")!.drawImage(v, 0, 0, largura, alt);
        tela.toBlob(
          (b) => {
            clearTimeout(desistir);
            resolve(b);
          },
          "image/jpeg",
          0.82,
        );
      } catch {
        clearTimeout(desistir);
        resolve(null);
      }
    };
    v.onerror = () => {
      clearTimeout(desistir);
      resolve(null);
    };
    v.src = urlVideo;
  });
}
