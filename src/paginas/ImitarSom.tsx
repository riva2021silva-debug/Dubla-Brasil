import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import OndaSimples from "../componentes/OndaSimples";
import { useConfig } from "../config";
import { blobDaMidia, db } from "../db";
import { useCarregar } from "../ganchos";
import { caracteristicas, comparar, rotuloDaNota, type Nota } from "../audio/analise";
import { Microfone, paraWav } from "../audio/microfone";
import { contextoDeAudio, decodificar } from "../audio/mixer";
import type { Imitacao, Som } from "../tipos";
import { formatarTempo } from "../util";

type Fase = "pronto" | "contagem" | "gravando" | "original" | "minha" | "melhor";

export default function ImitarSom() {
  const { id = "" } = useParams();
  const dados = useCarregar(async () => {
    const som = await db.obterSom(id);
    if (!som) throw new Error("Som não encontrado.");
    const [todos, melhor] = await Promise.all([db.listarSons(), db.obterImitacao(id)]);
    const publicados = todos.filter((s) => s.publicada).sort((a, b) => b.criadoEm - a.criadoEm);
    const i = publicados.findIndex((s) => s.id === id);
    return { som, melhor, proximo: publicados[i + 1] ?? publicados[0] };
  }, [id]);
  if (dados.carregando) return <p className="suave">Carregando…</p>;
  if (dados.erro || !dados.dado)
    return (
      <div className="vazio">
        <p className="alerta">{dados.erro}</p>
        <Link className="botao" to="/imitar">
          Voltar
        </Link>
      </div>
    );
  return <Imitar key={id} som={dados.dado.som} melhorInicial={dados.dado.melhor} proximo={dados.dado.proximo} />;
}

function Imitar({ som, melhorInicial, proximo }: { som: Som; melhorInicial?: Imitacao; proximo?: Som }) {
  const [cfg] = useConfig();
  const ctx = contextoDeAudio();
  const [original, setOriginal] = useState<AudioBuffer | null>(null);
  const [minha, setMinha] = useState<AudioBuffer | null>(null);
  const [melhorBuf, setMelhorBuf] = useState<AudioBuffer | null>(null);
  const [melhor, setMelhor] = useState<Imitacao | undefined>(melhorInicial);
  const [resultado, setResultado] = useState<(Nota & { recorde: boolean }) | null>(null);
  const [fase, setFase] = useState<Fase>("pronto");
  const [contagem, setContagem] = useState(3);
  const [progresso, setProgresso] = useState(0);
  const [aoVivo, setAoVivo] = useState<number[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const mic = useRef<Microfone | null>(null);
  const fonte = useRef<AudioBufferSourceNode | null>(null);
  const timers = useRef<number[]>([]);
  const sessao = useRef(0);

  useEffect(() => {
    let vivo = true;
    blobDaMidia(som.midia)
      .then((b) => decodificar(ctx, b))
      .then((buf) => vivo && setOriginal(buf))
      .catch(() => vivo && setErro("Não foi possível abrir o áudio deste som."));
    if (melhorInicial) decodificar(ctx, melhorInicial.audio).then((b) => vivo && setMelhorBuf(b));
    return () => {
      vivo = false;
      timers.current.forEach(clearTimeout);
      try {
        fonte.current?.stop();
      } catch {
        /* já parou */
      }
      mic.current?.fechar();
    };
  }, [som, melhorInicial, ctx]);

  const pararTudo = () => {
    sessao.current++;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    try {
      fonte.current?.stop();
    } catch {
      /* já parou */
    }
    fonte.current = null;
    mic.current?.parar();
    setProgresso(0);
    setFase("pronto");
  };

  const tocar = async (buf: AudioBuffer | null, qual: Fase) => {
    if (!buf) return;
    pararTudo();
    await ctx.resume();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    const inicio = ctx.currentTime;
    src.start();
    fonte.current = src;
    setFase(qual);
    const tique = () => {
      if (fonte.current !== src) return;
      const p = (ctx.currentTime - inicio) / buf.duration;
      setProgresso(Math.min(1, p));
      if (p < 1) requestAnimationFrame(tique);
    };
    requestAnimationFrame(tique);
    src.onended = () => {
      if (fonte.current === src) {
        fonte.current = null;
        setFase("pronto");
        setProgresso(0);
      }
    };
  };

  const gravar = async () => {
    if (!original) return;
    pararTudo();
    setErro(null);
    setResultado(null);
    try {
      await ctx.resume();
      if (!mic.current) mic.current = await Microfone.abrir(ctx, cfg);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      return;
    }
    const minhaSessao = sessao.current;
    setFase("contagem");
    setContagem(3);
    for (const [ms, n] of [[1000, 2], [2000, 1]] as const) timers.current.push(window.setTimeout(() => setContagem(n), ms));
    timers.current.push(
      window.setTimeout(() => {
        const m = mic.current!;
        setAoVivo([]);
        setFase("gravando");
        m.iniciar();
        const duracao = original.duration * 1000 + 1200;
        const inicio = performance.now();
        const tique = () => {
          const t = performance.now() - inicio;
          setProgresso(Math.min(1, t / duracao));
          setAoVivo((a) => [...a, m.nivel()]);
          if (t < duracao && sessao.current === minhaSessao) requestAnimationFrame(tique);
        };
        requestAnimationFrame(tique);
        timers.current.push(window.setTimeout(() => terminar(), duracao));
      }, 3000),
    );
  };

  const terminar = async () => {
    const g = mic.current?.parar();
    setFase("pronto");
    setProgresso(0);
    if (!g || g.amostras.length === 0 || !original) return setErro("Nada foi gravado. Confira o microfone em Configurações.");
    const buf = ctx.createBuffer(1, g.amostras.length, g.taxa);
    buf.copyToChannel(g.amostras as Float32Array<ArrayBuffer>, 0);
    setMinha(buf);
    const nota = comparar(caracteristicas(original.getChannelData(0), original.sampleRate), caracteristicas(g.amostras, g.taxa));
    const recorde = !melhor || nota.nota > melhor.nota;
    setResultado({ ...nota, recorde });
    const registro: Imitacao = recorde
      ? { somId: som.id, audio: paraWav(g.amostras, g.taxa), ...nota, tentativas: (melhor?.tentativas ?? 0) + 1, atualizadaEm: Date.now() }
      : { ...melhor!, tentativas: melhor!.tentativas + 1 };
    setMelhor(registro);
    if (recorde) setMelhorBuf(buf);
    await db.salvarImitacao(registro);
  };

  const ocupado = fase === "contagem" || fase === "gravando";

  return (
    <div className="estudio">
      <div className="estudio-topo">
        <Link to="/imitar" className="botao botao-pequeno" aria-label="Voltar para os sons">
          ←
        </Link>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="estudio-titulo">
            {som.emoji} {som.titulo}
          </div>
          <div className="suave pequeno">
            {som.categoria} · {formatarTempo(som.duracaoMs)}
            {melhor && ` · ${melhor.tentativas} ${melhor.tentativas === 1 ? "tentativa" : "tentativas"}`}
          </div>
        </div>
        {melhor && <span className="etiqueta etiqueta-ok">Recorde: {melhor.nota}</span>}
      </div>

      <div className={`palco-imitar ${fase === "gravando" ? "gravando" : ""}`}>
        {fase === "contagem" ? (
          <div className="contagem-imitar">{contagem}</div>
        ) : resultado ? (
          <div className="resultado">
            <div className="nota-grande" style={{ color: resultado.nota >= 75 ? "var(--verde)" : resultado.nota >= 45 ? "var(--amarelo)" : "var(--perigo)" }}>
              {resultado.nota}
            </div>
            <div className="rotulo-nota">{rotuloDaNota(resultado.nota)}</div>
            {resultado.recorde && <span className="etiqueta etiqueta-ok">🏆 Novo recorde!</span>}
            <div className="barras-nota">
              <Barra rotulo="Ritmo" valor={resultado.ritmo} />
              <Barra rotulo="Entonação" valor={resultado.entonacao} />
            </div>
          </div>
        ) : (
          <div className="resultado">
            <span className="emoji-som grande" aria-hidden>
              {som.emoji || "🔊"}
            </span>
            <p className="suave" style={{ margin: 0 }}>
              {fase === "gravando" ? "Gravando… imite agora!" : "Ouça o original e depois grave a sua versão."}
            </p>
          </div>
        )}
      </div>

      <div className="painel-onda">
        <span className="legenda-onda original">Original</span>
        <OndaSimples buffer={original} cor="rgb(56 189 248)" progresso={fase === "original" ? progresso : 1} />
        <span className={`legenda-onda minha`}>{fase === "gravando" ? "Gravando" : "Sua versão"}</span>
        <OndaSimples
          buffer={minha}
          cor={fase === "gravando" ? "#ef4444" : "#facc15"}
          progresso={fase === "minha" || fase === "gravando" ? progresso : 1}
          ao_vivo={fase === "gravando" ? aoVivo : undefined}
        />
      </div>

      <div className="botoes-redondos">
        <div className="botao-redondo-grupo">
          <button className={`botao-redondo ${fase === "original" ? "ativo" : ""}`} onClick={() => (fase === "original" ? pararTudo() : tocar(original, "original"))} disabled={!original || ocupado} aria-label="Ouvir o original">
            {fase === "original" ? "■" : "▶"}
          </button>
          <span className="rotulo-redondo">Original</span>
        </div>
        <div className="botao-redondo-grupo">
          <button
            className={`botao-redondo botao-gravar-grande ${ocupado ? "gravando" : ""}`}
            onClick={() => (ocupado ? pararTudo() : gravar())}
            disabled={!original}
            aria-label={ocupado ? "Cancelar gravação" : "Gravar a minha imitação"}
          >
            <span className={ocupado ? "quadrado" : "circulo"} />
          </button>
          <span className="rotulo-redondo">{ocupado ? "Cancelar" : minha ? "Tentar de novo" : "Gravar"}</span>
        </div>
        <div className="botao-redondo-grupo">
          <button className={`botao-redondo ${fase === "minha" ? "ativo" : ""} ${minha ? "tem-tomada" : ""}`} onClick={() => (fase === "minha" ? pararTudo() : tocar(minha, "minha"))} disabled={!minha || ocupado} aria-label="Ouvir a minha versão">
            {fase === "minha" ? "■" : "🎧"}
          </button>
          <span className="rotulo-redondo">Minha versão</span>
          {melhorBuf && melhorBuf !== minha && (
            <button className="botao-texto pequeno" onClick={() => tocar(melhorBuf, "melhor")} disabled={ocupado}>
              Ouvir o recorde
            </button>
          )}
        </div>
      </div>

      {erro && <p className="alerta">{erro}</p>}
      <div className="nav-falas">
        <Link className="botao-texto" to="/imitar">
          ‹ Todos os sons
        </Link>
        {proximo && proximo.id !== som.id && (
          <Link className={`botao-texto ${resultado ? "destaque-nav" : ""}`} to={`/imitar/${proximo.id}`}>
            Próximo som ›
          </Link>
        )}
      </div>
    </div>
  );
}

function Barra({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div className="barra-nota">
      <span>{rotulo}</span>
      <div className="trilho">
        <div style={{ width: `${valor}%` }} />
      </div>
      <b>{valor}</b>
    </div>
  );
}
