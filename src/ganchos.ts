import { useEffect, useState } from "react";
import { db, urlDaMidia } from "./db";
import { CENAS_EXEMPLO } from "./exemplos";
import type { Cena, Dub } from "./tipos";

export async function buscarCena(id: string): Promise<Cena | undefined> {
  return CENAS_EXEMPLO.find((c) => c.id === id) ?? (await db.obterCena(id));
}

export async function todasAsCenas(): Promise<Cena[]> {
  const minhas = await db.listarCenas();
  return [...minhas.sort((a, b) => b.atualizadaEm - a.atualizadaEm), ...CENAS_EXEMPLO];
}

type Estado<T> = { carregando: true; dado?: undefined; erro?: undefined } | { carregando: false; dado?: T; erro?: string };

export function useCarregar<T>(fn: () => Promise<T>, deps: unknown[]): Estado<T> & { recarregar: () => void } {
  const [estado, setEstado] = useState<Estado<T>>({ carregando: true });
  const [versao, setVersao] = useState(0);
  useEffect(() => {
    let vivo = true;
    setEstado({ carregando: true });
    fn().then(
      (dado) => vivo && setEstado({ carregando: false, dado }),
      (e) => vivo && setEstado({ carregando: false, erro: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, versao]);
  return { ...estado, recarregar: () => setVersao((v) => v + 1) };
}

/** URLs tocáveis do vídeo e do fundo de uma cena (libera os blobs ao desmontar). */
export function useMidiasDaCena(cena: Cena | undefined) {
  const [urls, setUrls] = useState<{ video: string; fundo: string | null } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    if (!cena) return;
    let vivo = true;
    const criadas: string[] = [];
    (async () => {
      const video = await urlDaMidia(cena.video);
      if (cena.video.tipo === "blob") criadas.push(video);
      const fundo = cena.fundo ? await urlDaMidia(cena.fundo) : null;
      if (fundo && cena.fundo?.tipo === "blob") criadas.push(fundo);
      if (vivo) setUrls({ video, fundo });
    })().catch((e) => vivo && setErro(e instanceof Error ? e.message : String(e)));
    return () => {
      vivo = false;
      criadas.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [cena]);
  return { urls, erro };
}

export async function dubsDaCena(cenaId: string): Promise<Dub[]> {
  return (await db.listarDubs()).filter((d) => d.cenaId === cenaId).sort((a, b) => b.atualizadoEm - a.atualizadoEm);
}

/** Atualiza o tempo atual do vídeo a cada quadro. */
export function useTempoDoVideo(video: HTMLVideoElement | null): number {
  const [ms, setMs] = useState(0);
  useEffect(() => {
    if (!video) return;
    let raf = 0;
    const loop = () => {
      setMs(video.currentTime * 1000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [video]);
  return ms;
}
