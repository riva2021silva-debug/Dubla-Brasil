import { useEffect, useState } from "react";
import { db, urlDaMidia } from "./db";
import { listarCenas, obterCena } from "./nuvem";
import type { Cena, Dub, FonteMidia } from "./tipos";

export async function buscarCena(id: string): Promise<Cena | undefined> {
  return obterCena(id);
}

/** Cenas do servidor: só as publicadas, ou todas (para o administrador logado). */
export async function todasAsCenas(incluirOcultas = false): Promise<Cena[]> {
  return listarCenas(incluirOcultas);
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

/** URL tocável/exibível de uma mídia opcional (ex.: a capa), liberada ao desmontar. */
export function useUrlDaMidia(fonte: FonteMidia | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!fonte) return setUrl(null);
    let vivo = true;
    let criada: string | null = null;
    urlDaMidia(fonte)
      .then((u) => {
        if (fonte.tipo === "blob") criada = u;
        if (vivo) setUrl(u);
        else if (criada) URL.revokeObjectURL(criada);
      })
      .catch(() => vivo && setUrl(null));
    return () => {
      vivo = false;
      if (criada) URL.revokeObjectURL(criada);
    };
  }, [fonte]);
  return url;
}

/**
 * Formato do vídeo (largura/altura), para o player se ajustar a vídeos deitados (16:9) e em pé (9:16).
 * Devolve as props para o contêiner do vídeo.
 */
export function useFormatoDoVideo(video: HTMLVideoElement | null) {
  const [proporcao, setProporcao] = useState(16 / 9);
  useEffect(() => {
    if (!video) return;
    const ler = () => video.videoWidth && video.videoHeight && setProporcao(video.videoWidth / video.videoHeight);
    ler();
    video.addEventListener("loadedmetadata", ler);
    return () => video.removeEventListener("loadedmetadata", ler);
  }, [video]);
  return {
    vertical: proporcao < 1,
    estilo: { aspectRatio: String(proporcao), "--proporcao": String(proporcao) } as React.CSSProperties,
  };
}
