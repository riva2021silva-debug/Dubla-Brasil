import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import LinhaDoTempo from "../componentes/LinhaDoTempo";
import Legenda from "../componentes/Legenda";
import { urlDaMidia } from "../db";
import { mensagemDeErro, salvarCena } from "../nuvem";
import { gerarRostos, rostoDaImagem, rostoDoQuadro } from "../rostos";
import type { Progresso } from "../transcricao";
import Avatar from "../componentes/Avatar";
import EditarVideo from "../componentes/EditarVideo";
import { ajustarFalas, cortarAudio, type Edicao } from "../edicaoVideo";
import { apagarRascunho, chaveDoRascunho, comoArquivo, guardarArquivo, guardarRascunho, lerArquivo, lerRascunho, quandoFoi, type Rascunho } from "../rascunho";
import { buscarCena, useFormatoDoVideo, useTempoDoVideo, useUrlDaMidia } from "../ganchos";
import type { Cena, Fala, Personagem } from "../tipos";
import { estaPublicada } from "../tipos";
import { corLivre, duracaoDoArquivo, formatarTempo, gerarCapa, IDIOMAS, lerSrt, novoId } from "../util";

interface Arquivo {
  url: string;
  /** Arquivo novo escolhido nesta edição (ainda não salvo). */
  novo?: File;
}

/** As cenas podem ter até 2 minutos. */
const DURACAO_MAXIMA_MS = 120_000;

function rascunhoVazio(): Cena {
  const agora = Date.now();
  return {
    id: novoId(),
    titulo: "",
    descricao: "",
    idioma: IDIOMAS[0],
    duracaoMs: 0,
    video: { tipo: "blob", chave: "" },
    fundo: null,
    personagens: [
      { id: novoId(), nome: "Personagem 1", cor: corLivre([]) },
      { id: novoId(), nome: "Personagem 2", cor: corLivre([corLivre([])]) },
    ],
    falas: [],
    criadaEm: agora,
    atualizadaEm: agora,
    publicada: true,
    capa: null,
  };
}

export default function Editor() {
  const { id } = useParams();
  const navegar = useNavigate();
  const [cena, setCena] = useState<Cena | null>(id ? null : rascunhoVazio);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [video, setVideo] = useState<Arquivo | null>(null);
  const [fundo, setFundo] = useState<Arquivo | null>(null);
  const [el, setEl] = useState<HTMLVideoElement | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [previa, setPrevia] = useState<string | null>(null); // id da fala que está tocando
  const [erroPrevia, setErroPrevia] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [etapa, setEtapa] = useState<string | null>(null);
  const [problemas, setProblemas] = useState<string[]>([]);
  const [alterado, setAlterado] = useState(false);
  // Rostos alterados nesta edição: Blob = foto nova, null = remover.
  const [novosRostos, setNovosRostos] = useState<Record<string, Blob | null>>({});
  const [previas, setPrevias] = useState<Record<string, string>>({});
  const [rostoOcupado, setRostoOcupado] = useState<string | null>(null);
  const [progressoIa, setProgressoIa] = useState<Progresso | null>(null);
  const [novaCapa, setNovaCapa] = useState<Blob | null>(null);
  const [editandoVideo, setEditandoVideo] = useState(false);
  const [avisoEdicao, setAvisoEdicao] = useState<string | null>(null);
  const [previaCapa, setPreviaCapa] = useState<string | null>(null);
  const [avisoCapa, setAvisoCapa] = useState<string | null>(null);
  const entradaCapa = useRef<HTMLInputElement>(null);
  const capaAtual = useUrlDaMidia(cena?.capa);
  const definirCapa = (b: Blob) => {
    setNovaCapa(b);
    setPreviaCapa((u) => {
      if (u) URL.revokeObjectURL(u);
      return URL.createObjectURL(b);
    });
    setAlterado(true);
    setAvisoCapa(null);
  };
  const [avisoIa, setAvisoIa] = useState<string | null>(null);
  const [confirmarSubstituir, setConfirmarSubstituir] = useState(false);
  const [avisoRosto, setAvisoRosto] = useState<string | null>(null);
  const entradaFoto = useRef<HTMLInputElement>(null);
  const fotoPara = useRef<string | null>(null);
  const entradaVideo = useRef<HTMLInputElement>(null);
  const entradaFundo = useRef<HTMLInputElement>(null);
  const entradaSrt = useRef<HTMLInputElement>(null);
  const tempo = useTempoDoVideo(el);
  const formato = useFormatoDoVideo(el);

  // Carrega uma cena existente.
  useEffect(() => {
    if (!id) return;
    let vivo = true;
    (async () => {
      const c = await buscarCena(id);
      if (!c) throw new Error("Cena não encontrada.");
      const v = await urlDaMidia(c.video);
      const f = c.fundo ? await urlDaMidia(c.fundo) : null;
      if (!vivo) return;
      setCena(c);
      setVideo({ url: v });
      setFundo(f ? { url: f } : null);
    })().catch((e) => vivo && setErroCarga(e instanceof Error ? e.message : String(e)));
    return () => {
      vivo = false;
    };
  }, [id]);

  // ---------- Rascunho automático (retomar a edição depois de sair da tela) ----------
  const [busca] = useSearchParams();
  const chaveRascunho = chaveDoRascunho(id);
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [retomando, setRetomando] = useState(false);
  const [rascunhoSalvoEm, setRascunhoSalvoEm] = useState<number | null>(null);
  const videoGuardado = useRef<File | undefined>(undefined);
  const fundoGuardado = useRef<File | undefined>(undefined);

  useEffect(() => {
    let vivo = true;
    void lerRascunho(chaveRascunho).then((r) => vivo && r && setRascunho(r));
    return () => {
      vivo = false;
    };
  }, [chaveRascunho]);

  const retomarRascunho = async (r: Rascunho) => {
    setRetomando(true);
    try {
      if (r.temVideo) {
        const b = await lerArquivo(chaveRascunho, "video");
        if (b) {
          const f = comoArquivo(b, r.videoNome, "video.mp4");
          videoGuardado.current = f;
          setVideo({ url: URL.createObjectURL(f), novo: f });
        }
      }
      if (r.fundo === "novo") {
        const b = await lerArquivo(chaveRascunho, "fundo");
        if (b) {
          const f = comoArquivo(b, r.fundoNome, "fundo.m4a");
          fundoGuardado.current = f;
          setFundo({ url: URL.createObjectURL(f), novo: f });
        }
      } else if (r.fundo === "removido") setFundo(null);
      setCena(r.cena);
      setNovosRostos(r.novosRostos ?? {});
      setPrevias(Object.fromEntries(Object.entries(r.novosRostos ?? {}).flatMap(([pid, b]) => (b ? [[pid, URL.createObjectURL(b)]] : []))));
      if (r.novaCapa) {
        setNovaCapa(r.novaCapa);
        setPreviaCapa(URL.createObjectURL(r.novaCapa));
      }
      setAlterado(true);
      setRascunhoSalvoEm(r.salvoEm);
      setRascunho(null);
    } finally {
      setRetomando(false);
    }
  };

  // Vindo do aviso da Administração ("Retomar edição"): retoma direto.
  useEffect(() => {
    if (rascunho && busca.get("retomar") === "1" && (!id || cena)) void retomarRascunho(rascunho);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rascunho, cena === null]);

  // Guarda o rascunho sozinho (0,8 s depois da última mudança), enquanto houver alterações não salvas.
  useEffect(() => {
    if (!alterado || !cena || rascunho || salvando) return;
    const t = setTimeout(() => {
      void (async () => {
        if (video?.novo !== videoGuardado.current) {
          await guardarArquivo(chaveRascunho, "video", video?.novo ?? null);
          videoGuardado.current = video?.novo;
        }
        if (fundo?.novo !== fundoGuardado.current) {
          await guardarArquivo(chaveRascunho, "fundo", fundo?.novo ?? null);
          fundoGuardado.current = fundo?.novo;
        }
        const agora = Date.now();
        await guardarRascunho({
          chave: chaveRascunho,
          salvoEm: agora,
          cena,
          temVideo: !!video?.novo,
          videoNome: video?.novo?.name ?? null,
          fundo: fundo?.novo ? "novo" : !fundo && (id ? !!cena.caminhos?.fundo : false) ? "removido" : null,
          fundoNome: fundo?.novo?.name ?? null,
          novosRostos,
          novaCapa,
        });
        setRascunhoSalvoEm(agora);
      })();
    }, 800);
    return () => clearTimeout(t);
  }, [alterado, cena, video, fundo, novosRostos, novaCapa, rascunho, salvando, chaveRascunho, id]);

  // Aviso ao sair com alterações não salvas.
  useEffect(() => {
    if (!alterado) return;
    const f = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", f);
    return () => window.removeEventListener("beforeunload", f);
  }, [alterado]);

  // A prévia de uma fala para sozinha no fim dela (olhando o próprio vídeo, quadro a quadro).
  const pararPrevia = useRef<() => void>(() => {});
  useEffect(() => () => pararPrevia.current(), []);

  const atualizar = (fn: (c: Cena) => Cena) => {
    setCena((c) => (c ? fn(c) : c));
    setAlterado(true);
    setProblemas([]);
  };
  const atualizarFala = (fid: string, p: Partial<Fala>) =>
    atualizar((c) => ({ ...c, falas: c.falas.map((f) => (f.id === fid ? { ...f, ...p } : f)) }));
  const atualizarPersonagem = (pid: string, p: Partial<Personagem>) =>
    atualizar((c) => ({ ...c, personagens: c.personagens.map((x) => (x.id === pid ? { ...x, ...p } : x)) }));

  const falasOrdenadas = useMemo(() => [...(cena?.falas ?? [])].sort((a, b) => a.inicioMs - b.inicioMs), [cena?.falas]);
  const falaSel = cena?.falas.find((f) => f.id === sel) ?? null;

  // Atalhos: I/O marcam início e fim, Espaço toca.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (editandoVideo) return; // a janela de editar vídeo usa as setas nos controles dela
      if ((e.target as HTMLElement).closest("input, textarea, select") || !el) return;
      const ms = Math.round(el.currentTime * 1000);
      if (e.key === " ") {
        e.preventDefault();
        if (el.paused) void el.play();
        else el.pause();
      } else if ((e.key === "i" || e.key === "I") && falaSel) atualizarFala(falaSel.id, { inicioMs: ms });
      else if ((e.key === "o" || e.key === "O") && falaSel) atualizarFala(falaSel.id, { fimMs: ms });
      else if (e.key === "n" || e.key === "N") novaFala();
      else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const passo = (e.shiftKey ? 100 : 1000) * (e.key === "ArrowLeft" ? -1 : 1);
        el.currentTime = Math.max(0, el.currentTime + passo / 1000);
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  });

  if (erroCarga)
    return (
      <div className="vazio">
        <p className="alerta">{erroCarga}</p>
        <Link className="botao" to="/admin/cena/nova">
          Criar cena nova
        </Link>
      </div>
    );
  if (!cena) return <p className="suave">Carregando…</p>;

  const escolherVideo = async (f: File) => {
    const url = URL.createObjectURL(f);
    try {
      const duracaoMs = await duracaoDoArquivo(url, "video");
      setVideo({ url, novo: f });
      atualizar((c) => ({ ...c, duracaoMs, titulo: c.titulo || f.name.replace(/\.[^.]+$/, "") }));
    } catch (e) {
      URL.revokeObjectURL(url);
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  /** Troca o vídeo pelo editado (cortado e/ou no novo formato) e ajusta falas e trilha de fundo ao corte. */
  const aplicarEdicao = async (arquivo: File, ed: Edicao) => {
    const cortou = ed.inicioMs > 0 || ed.fimMs < cena.duracaoMs - 50;
    let novoFundo: File | null = null;
    if (cortou && fundo) novoFundo = await cortarAudio(fundo.url, ed.inicioMs, ed.fimMs);
    const url = URL.createObjectURL(arquivo);
    const duracaoMs = await duracaoDoArquivo(url, "video").catch(() => ed.fimMs - ed.inicioMs);
    setVideo({ url, novo: arquivo });
    if (novoFundo) setFundo({ url: URL.createObjectURL(novoFundo), novo: novoFundo });
    atualizar((c) => ({ ...c, duracaoMs, falas: cortou ? ajustarFalas(c.falas, ed.inicioMs, ed.fimMs) : c.falas }));
    setEditandoVideo(false);
    const tamanho = (arquivo.size / 1024 / 1024).toFixed(1).replace(".", ",");
    setAvisoEdicao(
      `✅ Vídeo editado (${formatarTempo(duracaoMs)}, ${tamanho} MB)${ed.formato !== "original" ? `, formato ${ed.formato}` : ""}. ` +
        "Confira as falas e toque em “Salvar cena” para enviar." +
        (ed.formato !== "original" ? " Dica: gere a capa de novo pelo quadro atual." : ""),
    );
  };

  const escolherFundo = async (f: File) => {
    const url = URL.createObjectURL(f);
    try {
      await duracaoDoArquivo(url, "audio");
      setFundo({ url, novo: f });
      setAlterado(true);
    } catch {
      URL.revokeObjectURL(url);
      alert("Não foi possível ler esta trilha. Use MP3, M4A, WAV ou OGG.");
    }
  };

  function novaFala() {
    if (!cena) return;
    const ms = Math.round((el?.currentTime ?? 0) * 1000);
    const f: Fala = {
      id: novoId(),
      personagemId: falaSel?.personagemId ?? cena.personagens[0]?.id ?? "",
      texto: "",
      inicioMs: ms,
      fimMs: Math.min(ms + 2000, cena.duracaoMs || ms + 2000),
    };
    atualizar((c) => ({ ...c, falas: [...c.falas, f] }));
    setSel(f.id);
  }

  /** IA: ouve o vídeo, separa as falas, traduz para o português e sugere os personagens. */
  const separarAutomaticamente = async () => {
    if (!video || !cena) return;
    if (cena.falas.length && !confirmarSubstituir) {
      setConfirmarSubstituir(true);
      return;
    }
    setConfirmarSubstituir(false);
    setAvisoIa(null);
    setProgressoIa({ etapa: "preparando", detalhe: "Preparando…" });
    try {
      const { separarFalas } = await import("../transcricao");
      const falas = await separarFalas({ urlVideo: video.url, idioma: cena.idioma, personagens: cena.personagens, aoProgredir: setProgressoIa });
      atualizar((c) => ({ ...c, falas }));
      const vozes = new Set(falas.map((f) => f.personagemId)).size;
      setAvisoIa(
        `Encontrei ${falas.length} ${falas.length === 1 ? "fala" : "falas"}${cena.idioma.startsWith("Português") ? "" : ", já traduzidas para o português"}, em ${vozes} ${vozes === 1 ? "voz" : "vozes"}. Revise o texto, os tempos e os personagens antes de salvar.`,
      );
    } catch (e) {
      setAvisoIa(`Não deu certo: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setProgressoIa(null);
    }
  };

  const importarSrt = async (arq: File) => {
    const lidas = lerSrt(await arq.text());
    if (lidas.length === 0) return alert("Nenhuma legenda encontrada neste arquivo .srt.");
    const pid = cena.personagens[0]?.id ?? "";
    atualizar((c) => ({ ...c, falas: [...c.falas, ...lidas.map((l) => ({ ...l, id: novoId(), personagemId: pid }))] }));
  };

  const previaFala = (f: Fala) => {
    if (!el) return;
    const mesma = previa === f.id;
    pararPrevia.current();
    if (mesma) return; // tocar de novo no ⏸ só para
    setErroPrevia(null);
    // play() direto no toque (o celular só deixa tocar com som assim).
    el.currentTime = f.inicioMs / 1000;
    el.play().catch((e) => {
      setPrevia(null);
      setErroPrevia(`Não foi possível tocar o vídeo (${e instanceof Error ? e.message : e}). Toque no ▶ do vídeo lá em cima e tente de novo.`);
    });
    setPrevia(f.id);
    let raf = 0;
    const fim = () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("pause", fim);
      if (!el.paused) el.pause();
      setPrevia(null);
      pararPrevia.current = () => {};
    };
    const vigiar = () => {
      if (el.currentTime * 1000 >= f.fimMs || el.ended) return fim();
      raf = requestAnimationFrame(vigiar);
    };
    raf = requestAnimationFrame(vigiar);
    // Se a pessoa pausar pelo vídeo, a prévia acaba.
    setTimeout(() => el.addEventListener("pause", fim), 300);
    pararPrevia.current = fim;
  };

  const validar = (): string[] => {
    const p: string[] = [];
    if (!cena.titulo.trim()) p.push("Dê um título para a cena.");
    if (!video) p.push("Escolha o vídeo da cena.");
    if (cena.duracaoMs > DURACAO_MAXIMA_MS + 5000)
      p.push(`O vídeo tem ${formatarTempo(cena.duracaoMs)}. O máximo é 2 minutos: toque em “✂️ Editar vídeo” e corte o trecho que quer.`);
    if (video?.novo && video.novo.size > 50 * 1024 * 1024)
      p.push(`O vídeo tem ${(video.novo.size / 1024 / 1024).toFixed(0)} MB (máximo 50 MB). Toque em “✂️ Editar vídeo” → “Aplicar” para deixar mais leve.`);
    if (cena.personagens.length === 0) p.push("Adicione pelo menos um personagem.");
    if (cena.personagens.some((x) => !x.nome.trim())) p.push("Todos os personagens precisam de nome.");
    if (cena.falas.length === 0) p.push("Adicione pelo menos uma fala.");
    cena.falas.forEach((f) => {
      const n = falasOrdenadas.indexOf(f) + 1;
      if (f.fimMs <= f.inicioMs) p.push(`A fala ${n} termina antes de começar.`);
      if (!cena.personagens.some((x) => x.id === f.personagemId)) p.push(`A fala ${n} está sem personagem.`);
    });
    return p;
  };

  const definirRosto = (pid: string, foto: Blob | null) => {
    setNovosRostos((r) => ({ ...r, [pid]: foto }));
    setPrevias((pv) => {
      if (pv[pid]) URL.revokeObjectURL(pv[pid]);
      const n = { ...pv };
      if (foto) n[pid] = URL.createObjectURL(foto);
      else delete n[pid];
      return n;
    });
    setAlterado(true);
  };
  const fotoAtual = (p: Personagem) => (pidRemovido(p.id) ? null : (previas[p.id] ?? p.foto ?? null));
  const pidRemovido = (pid: string) => pid in novosRostos && novosRostos[pid] === null;

  /** Procura os rostos no vídeo. `todos` = refaz todos; senão só quem ainda não tem foto. */
  const encontrarRostos = async (todos: boolean): Promise<Record<string, Blob>> => {
    if (!video || !cena) return {};
    const alvo = cena.personagens.filter(
      (p) => cena.falas.some((f) => f.personagemId === p.id) && (todos || (!fotoAtual(p) && !pidRemovido(p.id))),
    );
    if (!alvo.length) return {};
    setRostoOcupado("todos");
    setAvisoRosto(null);
    try {
      const achados = await gerarRostos(video.url, alvo, cena.falas, (f, t) => setEtapa(`Procurando os rostos… ${f}/${t}`));
      const sem = alvo.filter((p) => achados[p.id] && !achados[p.id].achouRosto).map((p) => p.nome);
      if (sem.length)
        setAvisoRosto(`Não achei um rosto nítido para ${sem.join(", ")}: usei o centro do vídeo. Ajuste com “Quadro atual” ou “Foto”.`);
      const saida: Record<string, Blob> = {};
      for (const [pid, r] of Object.entries(achados)) {
        definirRosto(pid, r.foto);
        saida[pid] = r.foto;
      }
      return saida;
    } catch {
      setAvisoRosto("Não foi possível procurar os rostos neste aparelho. Use “Quadro atual” ou envie uma foto.");
      return {};
    } finally {
      setRostoOcupado(null);
    }
  };

  const rostoDoQuadroAtual = async (pid: string) => {
    if (!el) return;
    el.pause();
    setRostoOcupado(pid);
    try {
      const r = await rostoDoQuadro(el);
      definirRosto(pid, r.foto);
      setAvisoRosto(r.achouRosto ? null : "Nenhum rosto nesse quadro: usei o centro da imagem. Pause num momento com o rosto bem visível.");
    } catch {
      setAvisoRosto("Não foi possível usar este quadro.");
    } finally {
      setRostoOcupado(null);
    }
  };

  const salvar = async () => {
    const p = validar();
    setProblemas(p);
    if (p.length) return;
    setSalvando(true);
    try {
      const c: Cena = { ...cena, falas: falasOrdenadas, atualizadaEm: Date.now() };
      // Capa: um quadro do vídeo no meio da primeira fala (se o vídeo mudou ou ainda não há capa).
      let capa: Blob | undefined = novaCapa ?? undefined;
      if (!capa && video && (video.novo || !c.capa)) {
        const primeira = falasOrdenadas[0];
        const ms = primeira ? (primeira.inicioMs + primeira.fimMs) / 2 : Math.min(2000, c.duracaoMs / 2);
        capa = (await gerarCapa(video.url, ms)) ?? undefined;
      }
      // Personagens que falam e ainda não têm foto ganham o rosto automaticamente.
      const automaticos = await encontrarRostos(false);
      setEtapa(video?.novo || fundo?.novo ? "Enviando os arquivos para o servidor…" : "Salvando…");
      await salvarCena(c, {
        video: video?.novo,
        fundo: fundo?.novo ? fundo.novo : !fundo && c.caminhos?.fundo ? null : undefined,
        capa,
        rostos: { ...novosRostos, ...automaticos },
      });
      setAlterado(false);
      await apagarRascunho(chaveRascunho);
      navegar("/admin");
    } catch (e) {
      setProblemas([`Não foi possível salvar: ${mensagemDeErro(e)}`]);
    } finally {
      setSalvando(false);
      setEtapa(null);
    }
  };

  return (
    <div className="pilha">
      {rascunho && (
        <div className="aviso-rascunho" role="alert">
          <div>
            <b>📝 Você tem uma edição não salva</b>
            <span className="suave pequeno">
              {" "}
              de {quandoFoi(rascunho.salvoEm)}
              {rascunho.cena.titulo ? ` · “${rascunho.cena.titulo}”` : ""} · {rascunho.cena.falas.length} falas
              {rascunho.temVideo ? " · com o vídeo" : ""}
            </span>
          </div>
          <div className="linha" style={{ gap: 8 }}>
            <button className="botao botao-primario" disabled={retomando} onClick={() => void retomarRascunho(rascunho)}>
              {retomando ? "Abrindo…" : "↩ Retomar edição"}
            </button>
            <button
              className="botao"
              disabled={retomando}
              onClick={() => {
                void apagarRascunho(chaveRascunho);
                setRascunho(null);
              }}
            >
              Descartar
            </button>
          </div>
        </div>
      )}
      <div className="linha entre">
        <div>
          <Link to="/admin" className="pequeno">
            ← Administração
          </Link>
          <h1>{id ? "Editar cena" : "Adicionar vídeo"}</h1>
          {rascunhoSalvoEm && alterado && <span className="selo-rascunho">📝 Rascunho salvo no aparelho às {quandoFoi(rascunhoSalvoEm).split(" ")[1]}</span>}
          <p className="suave" style={{ margin: 0 }}>
            Envie o vídeo, cadastre os personagens e marque quando cada fala começa e termina.
          </p>
        </div>
        <div className="linha">
          <label className="linha interruptor">
            <input id="publicada" type="checkbox" checked={estaPublicada(cena)} onChange={(e) => atualizar((c) => ({ ...c, publicada: e.target.checked }))} />
            <span>Publicada no app</span>
          </label>
          <button className="botao botao-primario botao-grande" onClick={salvar} disabled={salvando}>
            {salvando ? (etapa ?? "Salvando…") : "💾 Salvar cena"}
          </button>
        </div>
      </div>

      {problemas.length > 0 && (
        <div className="alerta">
          {problemas.map((p) => (
            <div key={p}>• {p}</div>
          ))}
        </div>
      )}

      <div className="duas-colunas">
        <div className="pilha">
          {video ? (
            <>
              <div className={`palco ${formato.vertical ? "vertical" : ""} ${previa ? "palco-mini" : ""}`} style={formato.estilo}>
                <video crossOrigin="anonymous" ref={setEl} src={video.url} controls playsInline preload="auto" />
                <Legenda falas={cena.falas} personagens={cena.personagens} tempoMs={tempo} />
              </div>
              <LinhaDoTempo
                duracaoMs={cena.duracaoMs}
                tempoMs={tempo}
                falas={cena.falas}
                personagens={cena.personagens}
                selecionada={sel}
                onBuscar={(ms) => el && (el.currentTime = ms / 1000)}
                onSelecionar={setSel}
              />
              <div className="controles">
                <button className="botao" onClick={() => (el?.paused ? el.play() : el?.pause())}>
                  ⏯ Tocar/pausar
                </button>
                <button className="botao botao-primario" onClick={novaFala}>
                  + Fala aqui <kbd>N</kbd>
                </button>
                <button className="botao" onClick={() => entradaSrt.current?.click()}>
                  📄 Importar legendas (.srt)
                </button>
                <button
                  className="botao"
                  onClick={() => {
                    el?.pause();
                    setAvisoEdicao(null);
                    setEditandoVideo(true);
                  }}
                >
                  ✂️ Editar vídeo
                </button>
                <span className="tempo">
                  {formatarTempo(tempo)} / {formatarTempo(cena.duracaoMs)}
                </span>
              </div>
              {avisoEdicao && <p className="info" style={{ margin: 0 }}>{avisoEdicao}</p>}
              {(cena.duracaoMs > DURACAO_MAXIMA_MS + 5000 || (video.novo && video.novo.size > 45 * 1024 * 1024)) && !editandoVideo && (
                <div className="aviso-rascunho">
                  <span>
                    {cena.duracaoMs > DURACAO_MAXIMA_MS + 5000
                      ? `⚠️ O vídeo tem ${formatarTempo(cena.duracaoMs)}. As cenas podem ter até 2 minutos: corte o trecho que quer.`
                      : `⚠️ O vídeo tem ${((video.novo?.size ?? 0) / 1024 / 1024).toFixed(0)} MB. Deixe mais leve antes de salvar (o máximo é 50 MB).`}
                  </span>
                  <button className="botao botao-primario" onClick={() => (el?.pause(), setAvisoEdicao(null), setEditandoVideo(true))}>
                    ✂️ {cena.duracaoMs > DURACAO_MAXIMA_MS + 5000 ? "Cortar para 2 minutos" : "Deixar mais leve"}
                  </button>
                </div>
              )}
              {editandoVideo && (
                <EditarVideo
                  url={video.url}
                  duracaoMs={cena.duracaoMs}
                  avisoFalas={cena.falas.length > 0 || !!fundo}
                  deixarLeve={!!video.novo && video.novo.size > 45 * 1024 * 1024}
                  duracaoMaxMs={DURACAO_MAXIMA_MS}
                  aoAplicar={aplicarEdicao}
                  aoFechar={() => setEditandoVideo(false)}
                />
              )}
              <p className="suave pequeno" style={{ margin: 0 }}>
                Atalhos: <kbd>Espaço</kbd> tocar · <kbd>I</kbd> marcar início · <kbd>O</kbd> marcar fim da fala selecionada ·{" "}
                <kbd>←</kbd>
                <kbd>→</kbd> 1 s (com <kbd>Shift</kbd>, 0,1 s)
              </p>
            </>
          ) : (
            <button className="cartao vazio" style={{ cursor: "pointer", borderStyle: "dashed" }} onClick={() => entradaVideo.current?.click()}>
              <div style={{ fontSize: "2.5rem" }}>🎬</div>
              <strong>Escolher o vídeo da cena</strong>
              <p className="pequeno">MP4 ou WebM, de até 2 minutos.</p>
            </button>
          )}

          <section className="cartao pilha">
            <div className="linha entre">
              <h3 style={{ margin: 0 }}>Falas ({cena.falas.length})</h3>
              {falaSel && (
                <span className="suave pequeno">
                  Selecionada: fala {falasOrdenadas.indexOf(falaSel) + 1}
                </span>
              )}
            </div>
            <div className="cartao-ia">
              <div className="linha entre">
                <span>
                  <strong>✨ Separar falas automaticamente</strong>
                  <br />
                  <span className="suave pequeno">
                    A IA ouve o vídeo, separa cada fala com início e fim, traduz para o português e sugere o personagem pelo tom de voz.
                    Confira o idioma em “Idioma das falas” antes.
                  </span>
                </span>
                <button className="botao botao-primario" disabled={!video || !!progressoIa} onClick={() => void separarAutomaticamente()}>
                  {progressoIa ? "Processando…" : confirmarSubstituir ? "Substituir as falas?" : "✨ Separar falas"}
                </button>
              </div>
              {confirmarSubstituir && !progressoIa && (
                <div className="linha pequeno">
                  <span>Isso troca as {cena.falas.length} falas atuais pelas que a IA encontrar.</span>
                  <button className="botao botao-pequeno" onClick={() => setConfirmarSubstituir(false)}>
                    Cancelar
                  </button>
                </div>
              )}
              {progressoIa && (
                <div className="pilha" style={{ gap: 6 }}>
                  <span className="pequeno">{progressoIa.detalhe}</span>
                  <div className="medidor">
                    <div style={{ width: `${Math.round((progressoIa.fracao ?? (progressoIa.etapa === "ouvindo" ? 0.5 : 0.1)) * 100)}%` }} />
                  </div>
                </div>
              )}
              {avisoIa && <p className="info pequeno" style={{ margin: 0 }}>{avisoIa}</p>}
            </div>
            {cena.falas.length === 0 && !progressoIa && (
              <p className="suave pequeno" style={{ margin: 0 }}>
                Ou faça à mão: toque o vídeo até o começo de uma fala e clique em “+ Fala aqui”, ou importe um arquivo de legendas .srt.
              </p>
            )}
            {erroPrevia && <p className="alerta">{erroPrevia}</p>}
            {cena.falas.length > 0 && (
              <p className="dica-legendas pequeno">
                ✏️ <b>Corrigir legenda:</b> toque no texto de qualquer fala e escreva o que o personagem realmente diz. Use ▶ para ouvir só
                aquele trecho. Depois, toque em “Salvar cena”.
              </p>
            )}
            <div className="tabela-falas">
              {falasOrdenadas.map((f, i) => (
                <div key={f.id} className={`linha-fala ${f.id === sel ? "selecionada" : ""}`} onClick={() => setSel(f.id)}>
                  <strong className="suave">{i + 1}</strong>
                  <select
                    className="entrada"
                    value={f.personagemId}
                    onChange={(e) => atualizarFala(f.id, { personagemId: e.target.value })}
                    aria-label="Personagem"
                    style={{ borderColor: cena.personagens.find((p) => p.id === f.personagemId)?.cor }}
                  >
                    {!cena.personagens.some((p) => p.id === f.personagemId) && <option value="">—</option>}
                    {cena.personagens.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nome}
                      </option>
                    ))}
                  </select>
                  <div style={{ minWidth: 0 }}>
                    <textarea
                      className="entrada texto-legenda"
                      rows={Math.min(4, Math.max(1, Math.ceil(f.texto.length / 34)))}
                      value={f.texto}
                      placeholder="O que o personagem diz (legenda em português)…"
                      onChange={(e) => atualizarFala(f.id, { texto: e.target.value })}
                      onFocus={() => setSel(f.id)}
                      aria-label="Texto da fala"
                    />
                    {f.original !== undefined && (
                      <label className="original-editavel" title="Texto no idioma original (o que o personagem fala no vídeo)">
                        <span aria-hidden>🌐</span>
                        <input
                          className="entrada"
                          value={f.original}
                          placeholder="Texto original"
                          onChange={(e) => atualizarFala(f.id, { original: e.target.value })}
                          aria-label="Texto original da fala"
                        />
                      </label>
                    )}
                  </div>
                  <div className="linha tempos" style={{ gap: 4 }}>
                    <AjusteTempo rotulo="início" ms={f.inicioMs} onMarcar={() => atualizarFala(f.id, { inicioMs: Math.round(tempo) })} onMudar={(ms) => atualizarFala(f.id, { inicioMs: ms })} />
                    <AjusteTempo rotulo="fim" ms={f.fimMs} onMarcar={() => atualizarFala(f.id, { fimMs: Math.round(tempo) })} onMudar={(ms) => atualizarFala(f.id, { fimMs: ms })} />
                    <button className="botao botao-pequeno botao-icone" title="Ouvir esta fala" aria-label="Ouvir esta fala" onClick={(e) => { e.stopPropagation(); previaFala(f); }}>
                      {previa === f.id ? "⏸" : "▶"}
                    </button>
                    <button
                      className="botao botao-pequeno botao-icone botao-perigo"
                      title="Excluir fala"
                      aria-label="Excluir fala"
                      onClick={(e) => {
                        e.stopPropagation();
                        atualizar((c) => ({ ...c, falas: c.falas.filter((x) => x.id !== f.id) }));
                      }}
                    >
                      🗑
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="pilha">
          <section className="cartao pilha">
            <h3 style={{ margin: 0 }}>Detalhes</h3>
            <label className="campo">
              Título
              <input className="entrada" value={cena.titulo} onChange={(e) => atualizar((c) => ({ ...c, titulo: e.target.value }))} placeholder="Ex.: A briga do pão de queijo" />
            </label>
            <label className="campo">
              Descrição
              <textarea className="entrada" value={cena.descricao} onChange={(e) => atualizar((c) => ({ ...c, descricao: e.target.value }))} placeholder="Do que se trata a cena?" />
            </label>
            <label className="campo">
              Idioma das falas
              <select className="entrada" value={cena.idioma} onChange={(e) => atualizar((c) => ({ ...c, idioma: e.target.value }))}>
                {IDIOMAS.map((i) => (
                  <option key={i}>{i}</option>
                ))}
              </select>
            </label>
          </section>

          <section className="cartao pilha">
            <h3 style={{ margin: 0 }}>Arquivos</h3>
            <div className="linha entre">
              <span>
                <strong>Vídeo</strong>
                <br />
                <span className="suave pequeno">{video ? `${formatarTempo(cena.duracaoMs, false)} de duração` : "obrigatório"}</span>
              </span>
              <button className="botao botao-pequeno" onClick={() => entradaVideo.current?.click()}>
                {video ? "Trocar" : "Escolher"}
              </button>
            </div>
            <div className="linha entre">
              <span>
                <strong>Trilha de fundo</strong>
                <br />
                <span className="suave pequeno">{fundo ? "carregada" : "opcional: música e efeitos sem vozes"}</span>
              </span>
              <span className="linha">
                {fundo && (
                  <button className="botao botao-pequeno botao-perigo" onClick={() => { setFundo(null); setAlterado(true); }}>
                    Remover
                  </button>
                )}
                <button className="botao botao-pequeno" onClick={() => entradaFundo.current?.click()}>
                  {fundo ? "Trocar" : "Escolher"}
                </button>
              </span>
            </div>
            {fundo && <audio src={fundo.url} controls style={{ width: "100%" }} />}
            <div className="linha" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
              <div className="capa capa-editor">
                {previaCapa || capaAtual ? <img src={previaCapa ?? capaAtual!} alt="Capa da cena" crossOrigin="anonymous" /> : <span aria-hidden>🎬</span>}
              </div>
              <div className="pilha" style={{ gap: 6, minWidth: 0 }}>
                <span>
                  <strong>Capa (miniatura)</strong>
                  <br />
                  <span className="suave pequeno">{previaCapa ? "nova capa escolhida" : capaAtual ? "capa atual" : "gerada sozinha ao salvar, ou escolha"}</span>
                </span>
                <div className="linha" style={{ gap: 6 }}>
                  <button
                    className="botao botao-pequeno"
                    disabled={!el}
                    title="Pause o vídeo no quadro que quer usar"
                    onClick={async () => {
                      if (!el) return;
                      el.pause();
                      const { fotografar, quadroEscuro, telaParaJpeg } = await import("../quadros");
                      const tela = fotografar(el, 960);
                      if (quadroEscuro(tela)) return setAvisoCapa("Esse quadro está escuro. Toque o vídeo e pause numa imagem bonita.");
                      definirCapa(await telaParaJpeg(tela));
                    }}
                  >
                    📷 Quadro atual
                  </button>
                  <button className="botao botao-pequeno" onClick={() => entradaCapa.current?.click()}>
                    🖼 Da galeria
                  </button>
                </div>
                {avisoCapa && <span className="pequeno" style={{ color: "var(--perigo)" }}>{avisoCapa}</span>}
              </div>
            </div>
            <p className="suave pequeno" style={{ margin: 0 }}>
              Com a trilha de fundo, a música continua tocando enquanto a pessoa dubla. Ela precisa começar junto com o
              vídeo. Ferramentas de separação de voz (como o Demucs) geram essa trilha a partir do áudio original.
            </p>
          </section>

          <section className="cartao pilha">
            <div className="linha entre">
              <h3 style={{ margin: 0 }}>Personagens</h3>
              <span className="linha" style={{ gap: 6 }}>
              <button
                className="botao botao-pequeno"
                disabled={!video || !!rostoOcupado || cena.falas.length === 0}
                title="Procura o rosto de cada personagem nos momentos em que ele fala"
                onClick={() => void encontrarRostos(true)}
              >
                {rostoOcupado === "todos" ? (etapa ?? "Procurando…") : "✨ Rostos automáticos"}
              </button>
              <button
                className="botao botao-pequeno"
                onClick={() =>
                  atualizar((c) => ({
                    ...c,
                    personagens: [...c.personagens, { id: novoId(), nome: `Personagem ${c.personagens.length + 1}`, cor: corLivre(c.personagens.map((p) => p.cor)) }],
                  }))
                }
              >
                + Adicionar
              </button>
              </span>
            </div>
            <p className="suave pequeno" style={{ margin: 0 }}>
              Ao salvar, o app procura sozinho o rosto de cada personagem no vídeo. Para ajustar, pause no rosto e toque em
              “Quadro atual”, ou envie uma foto.
            </p>
            {avisoRosto && <p className="info pequeno" style={{ margin: 0 }}>{avisoRosto}</p>}
            {cena.personagens.map((p) => {
              const usos = cena.falas.filter((f) => f.personagemId === p.id).length;
              return (
                <div key={p.id} className="personagem-editor">
                  <Avatar personagem={p} foto={fotoAtual(p)} tamanho={52} />
                  <div className="pilha" style={{ gap: 6, minWidth: 0, flex: 1 }}>
                  <div className="linha" style={{ flexWrap: "nowrap" }}>
                  <input type="color" value={p.cor} onChange={(e) => atualizarPersonagem(p.id, { cor: e.target.value })} aria-label={`Cor de ${p.nome}`} style={{ width: 38, height: 38, border: "none", background: "none", padding: 0, flex: "none" }} />
                  <input className="entrada" value={p.nome} onChange={(e) => atualizarPersonagem(p.id, { nome: e.target.value })} aria-label="Nome do personagem" />
                  <span className="suave pequeno" style={{ whiteSpace: "nowrap" }}>
                    {usos} {usos === 1 ? "fala" : "falas"}
                  </span>
                  <button
                    className="botao botao-pequeno botao-icone botao-perigo"
                    aria-label={`Excluir ${p.nome}`}
                    title={usos ? "Este personagem tem falas: mude o personagem delas antes de excluir" : "Excluir personagem"}
                    disabled={usos > 0}
                    onClick={() => atualizar((c) => ({ ...c, personagens: c.personagens.filter((x) => x.id !== p.id) }))}
                  >
                    🗑
                  </button>
                  </div>
                  <div className="linha" style={{ gap: 6 }}>
                    <button className="botao botao-pequeno" disabled={!el || !!rostoOcupado} title="Usa o quadro que está na tela do vídeo" onClick={() => void rostoDoQuadroAtual(p.id)}>
                      {rostoOcupado === p.id ? "Procurando…" : "📷 Quadro atual"}
                    </button>
                    <button
                      className="botao botao-pequeno"
                      disabled={!!rostoOcupado}
                      onClick={() => {
                        fotoPara.current = p.id;
                        entradaFoto.current?.click();
                      }}
                    >
                      🖼 Da galeria
                    </button>
                    {fotoAtual(p) && (
                      <button className="botao botao-pequeno" aria-label={`Remover foto de ${p.nome}`} onClick={() => definirRosto(p.id, null)}>
                        Remover foto
                      </button>
                    )}
                  </div>
                  </div>
                </div>
              );
            })}
          </section>
          <p className="suave pequeno">
            Use apenas vídeos e áudios que você tem direito de usar. Desmarque “Publicada no app” para guardar a cena
            como rascunho, sem aparecer para quem usa o app.
          </p>
        </div>
      </div>

      <input ref={entradaVideo} type="file" accept="video/*" className="oculto" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void escolherVideo(f); }} />
      <input ref={entradaFundo} type="file" accept="audio/*,video/*" className="oculto" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void escolherFundo(f); }} />
      <input
        ref={entradaFoto}
        type="file"
        accept="image/*"
        className="oculto"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          const pid = fotoPara.current;
          if (!f || !pid) return;
          setRostoOcupado(pid);
          try {
            definirRosto(pid, await rostoDaImagem(f));
          } catch (err) {
            setAvisoRosto(err instanceof Error ? err.message : String(err));
          } finally {
            setRostoOcupado(null);
          }
        }}
      />
      <input
        ref={entradaCapa}
        type="file"
        accept="image/*"
        className="oculto"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          // Reduz para no máximo 960 px de largura, em JPEG (capa leve para carregar rápido).
          const url = URL.createObjectURL(f);
          try {
            const img = new Image();
            img.src = url;
            await img.decode();
            const escala = Math.min(1, 960 / img.width);
            const tela = document.createElement("canvas");
            tela.width = Math.round(img.width * escala);
            tela.height = Math.round(img.height * escala);
            tela.getContext("2d")!.drawImage(img, 0, 0, tela.width, tela.height);
            const { telaParaJpeg } = await import("../quadros");
            definirCapa(await telaParaJpeg(tela));
          } catch {
            setAvisoCapa("Não foi possível abrir essa imagem.");
          } finally {
            URL.revokeObjectURL(url);
          }
        }}
      />
      <input ref={entradaSrt} type="file" accept=".srt,text/plain" className="oculto" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void importarSrt(f); }} />
    </div>
  );
}

function AjusteTempo({ rotulo, ms, onMarcar, onMudar }: { rotulo: string; ms: number; onMarcar: () => void; onMudar: (ms: number) => void }) {
  return (
    <span className="ajuste-tempo" onClick={(e) => e.stopPropagation()}>
      <button className="botao botao-pequeno" style={{ padding: "4px 7px" }} title={`Diminuir ${rotulo} em 0,1 s`} aria-label={`Diminuir ${rotulo}`} onClick={() => onMudar(Math.max(0, ms - 100))}>
        −
      </button>
      <button className="botao botao-pequeno" style={{ padding: "4px 7px" }} title={`Marcar ${rotulo} no tempo atual`} onClick={onMarcar}>
        {formatarTempo(ms)}
      </button>
      <button className="botao botao-pequeno" style={{ padding: "4px 7px" }} title={`Aumentar ${rotulo} em 0,1 s`} aria-label={`Aumentar ${rotulo}`} onClick={() => onMudar(ms + 100)}>
        +
      </button>
    </span>
  );
}
