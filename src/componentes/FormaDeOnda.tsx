import { useEffect, useRef } from "react";

export interface PontoAoVivo {
  ms: number;
  nivel: number;
}

interface Props {
  /** Áudio original da cena (para desenhar a fala original). */
  original: AudioBuffer | null;
  /** Sua tomada, posicionada no tempo da cena. */
  tomada: { buffer: AudioBuffer; inicioMs: number } | null;
  /** Níveis do microfone captados durante a gravação em andamento. */
  aoVivo: PontoAoVivo[];
  deMs: number;
  ateMs: number;
  falaInicioMs: number;
  falaFimMs: number;
  tempoMs: number;
  onBuscar?: (ms: number) => void;
}

const BARRAS = 120;

function picos(buf: AudioBuffer, inicioMs: number, deMs: number, ateMs: number): Float32Array {
  const saida = new Float32Array(BARRAS);
  const dados = buf.getChannelData(0);
  const taxa = buf.sampleRate;
  const passo = (ateMs - deMs) / BARRAS;
  for (let b = 0; b < BARRAS; b++) {
    const i0 = Math.floor(((deMs + b * passo - inicioMs) / 1000) * taxa);
    const i1 = Math.floor(((deMs + (b + 1) * passo - inicioMs) / 1000) * taxa);
    let p = 0;
    for (let i = Math.max(0, i0); i < Math.min(dados.length, i1); i += 4) p = Math.max(p, Math.abs(dados[i]));
    saida[b] = p;
  }
  return saida;
}

function cor(nome: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(nome).trim() || "#fff";
}

export default function FormaDeOnda(p: Props) {
  const tela = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = tela.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth;
    const h = c.clientHeight;
    if (c.width !== Math.round(w * dpr)) c.width = Math.round(w * dpr);
    if (c.height !== Math.round(h * dpr)) c.height = Math.round(h * dpr);
    const g = c.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const total = Math.max(1, p.ateMs - p.deMs);
    const x = (ms: number) => ((ms - p.deMs) / total) * w;
    const meio = h / 2;
    const larg = w / BARRAS;

    // Faixa da fala.
    g.fillStyle = "rgba(168, 85, 247, 0.12)";
    g.fillRect(x(p.falaInicioMs), 0, x(p.falaFimMs) - x(p.falaInicioMs), h);
    g.fillStyle = "rgba(255,255,255,0.08)";
    g.fillRect(0, meio, w, 1);

    const barras = (valores: Float32Array | number[], estilo: string, escala: number) => {
      g.fillStyle = estilo;
      for (let b = 0; b < valores.length; b++) {
        const a = Math.min(1, valores[b] * escala) * (h * 0.46);
        if (a < 0.5) continue;
        g.fillRect(b * larg + larg * 0.18, meio - a, Math.max(1, larg * 0.64), a * 2);
      }
    };

    if (p.original) barras(picos(p.original, 0, p.deMs, p.ateMs), "rgba(56, 189, 248, 0.55)", 1.6);
    if (p.tomada) barras(picos(p.tomada.buffer, p.tomada.inicioMs, p.deMs, p.ateMs), cor("--amarelo"), 1.4);
    if (p.aoVivo.length) {
      const vivos = new Array(BARRAS).fill(0);
      for (const pt of p.aoVivo) {
        const b = Math.floor(((pt.ms - p.deMs) / total) * BARRAS);
        if (b >= 0 && b < BARRAS) vivos[b] = Math.max(vivos[b], pt.nivel);
      }
      barras(vivos, cor("--gravando"), 1.3);
    }

    // Cabeça de leitura.
    if (p.tempoMs >= p.deMs && p.tempoMs <= p.ateMs) {
      g.fillStyle = cor("--texto");
      g.fillRect(x(p.tempoMs) - 1, 0, 2, h);
    }
  }, [p.original, p.tomada, p.aoVivo, p.deMs, p.ateMs, p.falaInicioMs, p.falaFimMs, p.tempoMs]);

  return (
    <canvas
      ref={tela}
      className="onda"
      aria-label="Forma de onda da fala: original e sua gravação"
      onPointerDown={(e) => {
        if (!p.onBuscar) return;
        const r = e.currentTarget.getBoundingClientRect();
        p.onBuscar(p.deMs + ((e.clientX - r.left) / r.width) * (p.ateMs - p.deMs));
      }}
    />
  );
}
