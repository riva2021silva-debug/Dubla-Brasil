import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useConfig } from "../config";
import { tomDoQuadro } from "../audio/analise";
import { Microfone } from "../audio/microfone";
import { contextoDeAudio } from "../audio/mixer";

type Fase = "inicio" | "calibrar-grave" | "calibrar-agudo" | "pronto" | "jogando" | "fim";
interface Faixa {
  grave: number;
  agudo: number;
}

const CHAVE_FAIXA = "dubla-brasil:faixa-voz";
const CHAVE_RECORDE = "dubla-brasil:recorde-voz-no-alvo";
const NOTAS = ["Dó", "Dó#", "Ré", "Ré#", "Mi", "Fá", "Fá#", "Sol", "Sol#", "Lá", "Lá#", "Si"];

function nomeDaNota(hz: number) {
  const n = Math.round(12 * Math.log2(hz / 440)) + 57;
  return `${NOTAS[((n % 12) + 12) % 12]}${Math.floor(n / 12)}`;
}

function lerJson<T>(chave: string): T | null {
  try {
    const v = localStorage.getItem(chave);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}
function gravarJson(chave: string, v: unknown) {
  try {
    localStorage.setItem(chave, JSON.stringify(v));
  } catch {
    /* sem armazenamento */
  }
}

function cor(nome: string, padrao: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(nome).trim() || padrao;
}

export default function VozNoAlvo() {
  const [cfg] = useConfig();
  const [fase, setFase] = useState<Fase>("inicio");
  const [faixa, setFaixa] = useState<Faixa | null>(() => lerJson<Faixa>(CHAVE_FAIXA));
  const [recorde, setRecorde] = useState<number>(() => lerJson<number>(CHAVE_RECORDE) ?? 0);
  const [pontos, setPontos] = useState(0);
  const [notaAtual, setNotaAtual] = useState<string | null>(null);
  const [progressoCal, setProgressoCal] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const mic = useRef<Microfone | null>(null);
  const tela = useRef<HTMLCanvasElement>(null);
  const laco = useRef(0);
  const amostras = useRef(new Float32Array(2048));

  useEffect(
    () => () => {
      cancelAnimationFrame(laco.current);
      mic.current?.fechar();
    },
    [],
  );

  const abrirMic = async () => {
    setErro(null);
    try {
      const ctx = contextoDeAudio();
      await ctx.resume();
      if (!mic.current) mic.current = await Microfone.abrir(ctx, cfg);
      return mic.current;
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      return null;
    }
  };

  const lerTom = (m: Microfone) => {
    m.lerAmostras(amostras.current);
    return tomDoQuadro(amostras.current, m.taxa, 70, 1100, 0.12);
  };

  /** Escuta por 2,5 s e devolve a mediana do tom cantado. */
  const medir = (m: Microfone): Promise<number | null> =>
    new Promise((resolve) => {
      const valores: number[] = [];
      const inicio = performance.now();
      const tique = () => {
        const t = performance.now() - inicio;
        const hz = lerTom(m);
        if (hz) {
          valores.push(hz);
          setNotaAtual(nomeDaNota(hz));
        }
        setProgressoCal(Math.min(1, t / 2500));
        if (t < 2500) laco.current = requestAnimationFrame(tique);
        else {
          valores.sort((a, b) => a - b);
          resolve(valores.length > 15 ? valores[Math.floor(valores.length / 2)] : null);
        }
      };
      laco.current = requestAnimationFrame(tique);
    });

  const calibrar = async () => {
    const m = await abrirMic();
    if (!m) return;
    setFase("calibrar-grave");
    await new Promise((r) => setTimeout(r, 1200));
    const grave = await medir(m);
    setFase("calibrar-agudo");
    await new Promise((r) => setTimeout(r, 1200));
    const agudo = await medir(m);
    setNotaAtual(null);
    if (!grave || !agudo) {
      setErro("Não consegui ouvir a sua voz. Cante um “ôôô” contínuo, mais perto do microfone.");
      return setFase("inicio");
    }
    if (agudo < grave * 1.25) {
      setErro("As duas notas ficaram muito parecidas. Tente cantar a grave bem grave e a aguda bem aguda.");
      return setFase("inicio");
    }
    const nova = { grave, agudo };
    setFaixa(nova);
    gravarJson(CHAVE_FAIXA, nova);
    setFase("pronto");
  };

  const jogar = async () => {
    if (!faixa) return calibrar();
    const m = await abrirMic();
    const c = tela.current;
    if (!m || !c) return;
    setFase("jogando");
    setPontos(0);
    const g = c.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth;
    const h = c.clientHeight;
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cores = { amarelo: cor("--amarelo", "#facc15"), roxo: cor("--roxo", "#7c3aed"), verde: cor("--verde", "#22c55e"), texto: cor("--texto", "#fff") };

    const raio = Math.max(10, h * 0.035);
    const margem = raio * 2;
    const semGrave = 12 * Math.log2(faixa.grave);
    const semAgudo = 12 * Math.log2(faixa.agudo);
    let y = h - margem;
    let vel = w * 0.28;
    let vao = h * 0.36;
    let proximoPilar = 1.2;
    let tempo = 0;
    let feitos = 0;
    let anterior = performance.now();
    const pilares: { x: number; centro: number; vao: number; contou: boolean }[] = [];
    const rastro: number[] = [];
    const xBola = w * 0.25;

    const quadro = () => {
      const agora = performance.now();
      const dt = Math.min(0.05, (agora - anterior) / 1000);
      anterior = agora;
      tempo += dt;

      const hz = lerTom(m);
      if (hz) {
        const s = (12 * Math.log2(hz) - semGrave) / (semAgudo - semGrave);
        const alvo = h - margem - Math.max(0, Math.min(1, s)) * (h - 2 * margem);
        y += (alvo - y) * Math.min(1, dt * 9);
        setNotaAtual(nomeDaNota(hz));
      } else {
        y = Math.min(h - margem, y + h * 0.45 * dt);
        setNotaAtual(null);
      }
      rastro.push(y);
      if (rastro.length > 40) rastro.shift();

      proximoPilar -= dt;
      if (proximoPilar <= 0) {
        const centro = margem + vao / 2 + Math.random() * (h - 2 * margem - vao);
        pilares.push({ x: w + 30, centro, vao, contou: false });
        proximoPilar = Math.max(1.05, 1.9 - tempo * 0.012);
        vel = Math.min(w * 0.5, vel + w * 0.004);
        vao = Math.max(h * 0.24, vao - h * 0.004);
      }
      const largura = Math.max(36, w * 0.06);
      let bateu = false;
      for (const p of pilares) {
        p.x -= vel * dt;
        if (!p.contou && p.x + largura < xBola - raio) {
          p.contou = true;
          feitos++;
          setPontos(feitos);
        }
        const dentroX = xBola + raio > p.x && xBola - raio < p.x + largura;
        const foraVao = y - raio < p.centro - p.vao / 2 || y + raio > p.centro + p.vao / 2;
        if (dentroX && foraVao) bateu = true;
      }
      while (pilares.length && pilares[0].x < -largura - 10) pilares.shift();

      // Desenho.
      g.clearRect(0, 0, w, h);
      for (const p of pilares) {
        g.fillStyle = cores.roxo;
        g.fillRect(p.x, 0, largura, p.centro - p.vao / 2);
        g.fillRect(p.x, p.centro + p.vao / 2, largura, h - (p.centro + p.vao / 2));
        g.fillStyle = cores.amarelo;
        g.fillRect(p.x - 3, p.centro - p.vao / 2 - 6, largura + 6, 6);
        g.fillRect(p.x - 3, p.centro + p.vao / 2, largura + 6, 6);
      }
      g.strokeStyle = "rgba(250, 204, 21, 0.35)";
      g.lineWidth = raio * 0.6;
      g.lineCap = "round";
      g.beginPath();
      rastro.forEach((ry, i) => {
        const rx = xBola - (rastro.length - i) * (vel * 0.016);
        if (i === 0) g.moveTo(rx, ry);
        else g.lineTo(rx, ry);
      });
      g.stroke();
      g.shadowColor = cores.amarelo;
      g.shadowBlur = 18;
      g.fillStyle = hz ? cores.amarelo : "#a89ccf";
      g.beginPath();
      g.arc(xBola, y, raio, 0, Math.PI * 2);
      g.fill();
      g.shadowBlur = 0;

      if (bateu) {
        setFase("fim");
        if (feitos > recorde) {
          setRecorde(feitos);
          gravarJson(CHAVE_RECORDE, feitos);
        }
        return;
      }
      laco.current = requestAnimationFrame(quadro);
    };
    laco.current = requestAnimationFrame(quadro);
  };

  const parar = () => {
    cancelAnimationFrame(laco.current);
    setFase("pronto");
    setNotaAtual(null);
  };

  return (
    <div className="estudio">
      <div className="estudio-topo">
        <Link to="/jogos" className="botao botao-pequeno" aria-label="Voltar para os jogos">
          ←
        </Link>
        <div style={{ flex: 1 }}>
          <div className="estudio-titulo">Voz no Alvo</div>
          <div className="suave pequeno">Cante mais agudo para subir e mais grave para descer.</div>
        </div>
        <span className="etiqueta">🏆 Recorde: {recorde}</span>
      </div>

      <div className="palco-jogo">
        <canvas ref={tela} className="tela-jogo" aria-label="Área do jogo" />
        <div className="hud">
          <span className="pontos-jogo">{pontos}</span>
          {notaAtual && <span className="nota-voz">🎵 {notaAtual}</span>}
        </div>
        {fase !== "jogando" && (
          <div className="sobreposicao">
            {fase === "inicio" && (
              <>
                <span className="emoji-som grande">🎤</span>
                <p>Primeiro, vamos conhecer a sua voz: cante uma nota grave e depois uma aguda.</p>
                <button className="botao botao-primario botao-grande" onClick={calibrar}>
                  Calibrar a minha voz
                </button>
                {faixa && (
                  <button className="botao" onClick={() => setFase("pronto")}>
                    Usar a calibração anterior
                  </button>
                )}
              </>
            )}
            {(fase === "calibrar-grave" || fase === "calibrar-agudo") && (
              <>
                <p className="titulo-cal">{fase === "calibrar-grave" ? "Cante “ôôô” bem GRAVE" : "Agora cante “ôôô” bem AGUDO"}</p>
                <div className="medidor" style={{ width: "70%" }}>
                  <div style={{ width: `${progressoCal * 100}%` }} />
                </div>
                <p className="suave">{notaAtual ? `Ouvindo: ${notaAtual}` : "Aguardando a sua voz…"}</p>
              </>
            )}
            {fase === "pronto" && (
              <>
                <span className="emoji-som grande">🎯</span>
                <p>
                  Sua faixa: {faixa && `${nomeDaNota(faixa.grave)} até ${nomeDaNota(faixa.agudo)}`}. Em silêncio, a bolinha cai devagar.
                </p>
                <button className="botao botao-primario botao-grande" onClick={jogar}>
                  ▶ Jogar
                </button>
                <button className="botao" onClick={calibrar}>
                  Calibrar de novo
                </button>
              </>
            )}
            {fase === "fim" && (
              <>
                <p className="titulo-cal">Fim de jogo!</p>
                <p className="nota-grande" style={{ margin: 0 }}>
                  {pontos}
                </p>
                <p className="suave">{pontos >= recorde && pontos > 0 ? "🏆 Novo recorde!" : `Recorde: ${recorde}`}</p>
                <button className="botao botao-primario botao-grande" onClick={jogar}>
                  Jogar de novo
                </button>
              </>
            )}
            {erro && <p className="alerta">{erro}</p>}
          </div>
        )}
      </div>
      {fase === "jogando" && (
        <button className="botao" onClick={parar}>
          ■ Parar
        </button>
      )}
      <p className="info pequeno">🎧 Jogue com fones de ouvido ou num lugar silencioso, para o microfone ouvir só a sua voz.</p>
    </div>
  );
}
