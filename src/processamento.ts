// Processamento automático das cenas do admin (versão 5.7): o admin edita e toca em "Salvar". O app guarda tudo no
// aparelho e, sozinho, em segundo plano: deixa o vídeo leve, envia, separa as vozes com a IA (trilha de fundo; nas
// músicas também a voz do cantor) e só então publica. Dá para sair do Editor e adicionar outras cenas: a fila continua
// enquanto o app estiver aberto (e recomeça sozinha ao abrir o app de novo).
import { useEffect, useState } from "react";
import { db, urlDaMidia } from "./db";
import { mensagemDeErro, publicarCena, salvarCena } from "./nuvem";
import { diagnosticar, otimizarVideo, podeOtimizar } from "./otimizarVideo";
import { estaPublicada, type Cena } from "./tipos";

export type Etapa = "fila" | "otimizando" | "enviando" | "separando" | "publicando" | "pronto" | "erro" | "pausado";

export interface Trabalho {
  id: string;
  titulo: string;
  /** A cena como o admin salvou (publicada = o que ele marcou no Editor). */
  cena: Cena;
  publicar: boolean;
  /** Arquivos novos ainda não enviados. */
  video?: Blob;
  fundo?: Blob | null;
  voz?: Blob;
  capa?: Blob;
  rostos?: Record<string, Blob | null>;
  /** O vídeo e os dados já estão no servidor (escondidos até terminar). */
  enviado?: boolean;
  /** Vídeo leve guardado no aparelho para a IA não precisar baixar de novo. */
  videoLocal?: Blob;
  etapa: Etapa;
  detalhe: string;
  fracao: number;
  erro?: string;
  criadoEm: number;
}

/** A cena ainda precisa da IA: sem trilha de fundo, ou música sem a voz separada (para a nota). */
export const precisaDaIa = (c: Cena) => !c.caminhos?.fundo || (c.tipo === "musica" && !c.caminhos?.voz);

/** Só para os testes automáticos: pula a IA (que baixa 180 MB) e publica logo depois de enviar. */
const semIa = () => {
  try {
    return localStorage.getItem("dubla-brasil:teste-sem-ia") === "1";
  } catch {
    return false;
  }
};

let fila: Trabalho[] = [];
let carregado: Promise<void> | null = null;
let rodando = false;
let pausa = false;
let parar: AbortController | null = null;
const ouvintes = new Set<() => void>();

const avisar = () => {
  fila = [...fila];
  ouvintes.forEach((f) => f());
};

const guardar = async (t: Trabalho) => {
  try {
    // O que fica no aparelho: só o que ainda falta (não guarda o "pronto").
    if (t.etapa === "pronto") await db.excluirProcessamento(t.id);
    else await db.salvarProcessamento({ ...t, etapa: t.etapa === "erro" ? "erro" : "fila" });
  } catch {
    /* sem espaço no aparelho: segue só na memória */
  }
};

const mudar = (t: Trabalho, m: Partial<Trabalho>, salvar = false) => {
  Object.assign(t, m);
  avisar();
  if (salvar) void guardar(t);
};

function carregar() {
  carregado ??= db
    .listarProcessamento<Trabalho>()
    .then((salvos) => {
      for (const s of salvos.sort((a, b) => a.criadoEm - b.criadoEm)) if (!fila.some((t) => t.id === s.id)) fila.push({ ...s, etapa: s.etapa === "erro" ? "erro" : "fila" });
      avisar();
    })
    .catch(() => {});
  return carregado;
}

/** Começa (ou retoma) a fila. Chamado pelo app quando o admin está com a sessão aberta. */
export async function iniciarProcessamento() {
  await carregar();
  void rodar();
}

/** Coloca a cena salva no Editor na fila. Devolve logo: o resto acontece em segundo plano. */
export async function colocarNaFila(dados: Omit<Trabalho, "etapa" | "detalhe" | "fracao" | "criadoEm" | "titulo">) {
  await carregar();
  const antigo = fila.find((t) => t.id === dados.id);
  if (antigo && rodando && parar && antigo.etapa !== "erro" && antigo.etapa !== "pronto") parar.abort();
  const t: Trabalho = { ...dados, titulo: dados.cena.titulo.trim() || "Cena sem título", etapa: "fila", detalhe: "na fila…", fracao: 0, criadoEm: Date.now() };
  // Salvou de novo a mesma cena: a versão nova substitui a antiga (mantém o vídeo ainda não enviado).
  if (antigo && !t.video && antigo.video && !antigo.enviado) t.video = antigo.video;
  fila = fila.filter((x) => x.id !== t.id);
  fila.push(t);
  avisar();
  await db.salvarProcessamento(t); // se falhar, o Editor salva do jeito antigo
  void rodar();
}

export function tentarDeNovo(id: string) {
  const t = fila.find((x) => x.id === id);
  if (!t) return;
  mudar(t, { etapa: "fila", detalhe: "na fila…", erro: undefined, fracao: 0 }, true);
  void rodar();
}

/** A IA não deu certo: publica sem a trilha de fundo (a voz original sai na fala da pessoa). */
export async function publicarSemTrilha(id: string) {
  const t = fila.find((x) => x.id === id);
  if (!t?.enviado) return;
  try {
    if (t.publicar) await publicarCena(t.id, true);
    mudar(t, { etapa: "pronto", detalhe: t.publicar ? "✅ publicada (sem a trilha da IA)" : "✅ salva (sem a trilha da IA)", erro: undefined });
    await guardar(t);
    window.dispatchEvent(new Event("dubla:cenas-mudaram"));
  } catch (e) {
    mudar(t, { erro: mensagemDeErro(e) });
  }
}

export async function tirarDaFila(id: string) {
  fila = fila.filter((x) => x.id !== id);
  avisar();
  try {
    await db.excluirProcessamento(id);
  } catch {
    /* ok */
  }
}

/** Estúdio e resultado: a IA pesada espera (a dublagem não pode picotar) e volta sozinha depois. */
export function pausarProcessamento(sim: boolean) {
  if (pausa === sim) return;
  pausa = sim;
  if (sim) parar?.abort();
  else void rodar();
}

/** Fila atual (para o painel e o selo do topo). */
export function useProcessamento() {
  const [lista, setLista] = useState(fila);
  useEffect(() => {
    const f = () => setLista(fila);
    ouvintes.add(f);
    void carregar();
    f();
    return () => void ouvintes.delete(f);
  }, []);
  return lista;
}

export const emAndamento = (l: Trabalho[]) => l.filter((t) => t.etapa !== "pronto" && t.etapa !== "erro");

let trava: { release: () => Promise<void> } | null = null;
async function telaLigada(sim: boolean) {
  try {
    if (sim && !trava) trava = await (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request("screen") ?? null;
    else if (!sim && trava) {
      await trava.release();
      trava = null;
    }
  } catch {
    /* sem suporte: tudo bem */
  }
}

async function rodar() {
  if (rodando || pausa) return;
  rodando = true;
  try {
    for (;;) {
      if (pausa) break;
      const t = fila.find((x) => x.etapa === "fila" || x.etapa === "pausado");
      if (!t) break;
      void telaLigada(true);
      parar = new AbortController();
      await processar(t, parar.signal);
    }
  } finally {
    rodando = false;
    parar = null;
    if (!emAndamento(fila).length) void telaLigada(false);
  }
}

async function processar(t: Trabalho, sinal: AbortSignal) {
  const versao = t; // se o admin salvar de novo, o objeto da fila muda e este para
  const atual = () => fila.includes(versao) && !sinal.aborted;
  try {
    // 1) Vídeo leve para o celular (pular entre as falas sem travar).
    if (!t.enviado) {
      let video = t.video;
      if (video && podeOtimizar()) {
        mudar(t, { etapa: "otimizando", detalhe: "⚡ conferindo o vídeo…", fracao: 0 });
        try {
          if ((await diagnosticar(video)).motivos.length) {
            const leve = await otimizarVideo(video, (f) => mudar(t, { detalhe: `⚡ deixando o vídeo leve ${Math.round(f * 100)}%`, fracao: f }));
            if (leve) video = new File([leve], "video.mp4", { type: "video/mp4" });
          }
        } catch {
          /* não conseguiu: envia o original */
        }
      }
      if (!atual()) return;
      // 2) Envia. Se ainda vai passar pela IA, fica escondida até terminar.
      mudar(t, { etapa: "enviando", detalhe: "☁️ enviando para o servidor…", fracao: 0 });
      // O que a cena vai ter no servidor depois deste envio (vídeo novo apaga a voz antiga do cantor).
      const temFundo = t.fundo ? true : t.fundo === null ? false : !!t.cena.caminhos?.fundo;
      const temVoz = !!t.voz || (!video && !!t.cena.caminhos?.voz);
      const vaiPrecisar = !semIa() && (!temFundo || (t.cena.tipo === "musica" && !temVoz));
      const salva = await salvarCena(
        { ...t.cena, publicada: vaiPrecisar ? false : t.publicar },
        { video, fundo: t.fundo, capa: t.capa, ...(t.voz ? { voz: t.voz } : {}), rostos: t.rostos },
      );
      mudar(t, { cena: salva, enviado: true, videoLocal: video, video: undefined, fundo: undefined, voz: undefined, capa: undefined, rostos: undefined }, true);
      window.dispatchEvent(new Event("dubla:cenas-mudaram"));
    }
    if (!atual()) return;
    // 3) IA separa as vozes: trilha de fundo (e a voz do cantor nas músicas).
    if (precisaDaIa(t.cena) && !semIa()) {
      mudar(t, { etapa: "separando", detalhe: "✨ separando as vozes…", fracao: 0 });
      const { gerarTrilhaDeFundo } = await import("./separacao");
      const url = t.videoLocal ? URL.createObjectURL(t.videoLocal) : await urlDaMidia(t.cena.video);
      try {
        const musica = t.cena.tipo === "musica";
        const { arquivo, voz } = await gerarTrilhaDeFundo(url, (p) => mudar(t, { detalhe: `✨ ${p.detalhe} ${Math.round(p.fracao * 100)}%`, fracao: p.fracao }), { comVoz: musica, sinal });
        if (!atual()) return;
        mudar(t, { etapa: "enviando", detalhe: "☁️ enviando a trilha…", fracao: 1 });
        const salva = await salvarCena({ ...t.cena, publicada: false }, { fundo: arquivo, ...(voz ? { voz } : {}) });
        mudar(t, { cena: salva }, true);
      } finally {
        if (url.startsWith("blob:")) URL.revokeObjectURL(url);
      }
    }
    if (!atual()) return;
    // 4) Publica (se o admin deixou marcado "Publicada").
    if (t.publicar && !estaPublicada(t.cena)) {
      mudar(t, { etapa: "publicando", detalhe: "🚀 publicando…" });
      await publicarCena(t.id, true);
    }
    mudar(t, { etapa: "pronto", detalhe: t.publicar ? "✅ pronta e publicada" : "✅ pronta (não publicada, como você marcou)", fracao: 1, videoLocal: undefined });
    await guardar(t);
    window.dispatchEvent(new Event("dubla:cenas-mudaram"));
  } catch (e) {
    if (sinal.aborted) {
      // Pausou (estúdio) ou foi substituída: volta para a fila, do ponto em que parou.
      if (fila.includes(versao)) mudar(t, { etapa: "pausado", detalhe: "⏸️ pausada enquanto você dubla" });
      return;
    }
    const erro = mensagemDeErro(e);
    mudar(t, { etapa: "erro", detalhe: "não deu", erro }, true);
    // Internet caiu: tenta de novo sozinho daqui a pouco (e assim que a conexão voltar).
    if (/conexão/i.test(erro)) {
      const tentativas = (semInternet.get(t.id) ?? 0) + 1;
      semInternet.set(t.id, tentativas);
      if (tentativas <= 3) setTimeout(() => t.etapa === "erro" && fila.includes(t) && tentarDeNovo(t.id), 20000 * tentativas);
    }
  }
}

const semInternet = new Map<string, number>();
if (typeof window !== "undefined")
  window.addEventListener("online", () => {
    for (const t of fila) if (t.etapa === "erro" && /conexão/i.test(t.erro ?? "")) tentarDeNovo(t.id);
  });
