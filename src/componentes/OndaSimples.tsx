import { useEffect, useRef } from "react";

/** Desenha a forma de onda de um áudio inteiro, com o progresso da reprodução. */
export default function OndaSimples({ buffer, cor, progresso = 0, ao_vivo }: { buffer: AudioBuffer | null; cor: string; progresso?: number; ao_vivo?: number[] }) {
  const tela = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = tela.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth;
    const h = c.clientHeight;
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    const g = c.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const barras = Math.max(20, Math.floor(w / 5));
    let valores: number[] = [];
    if (ao_vivo && ao_vivo.length) {
      valores = Array.from({ length: barras }, (_, b) => ao_vivo[Math.floor((b / barras) * ao_vivo.length)] ?? 0);
    } else if (buffer) {
      const d = buffer.getChannelData(0);
      const passo = Math.max(1, Math.floor(d.length / barras));
      let max = 1e-6;
      for (let b = 0; b < barras; b++) {
        let p = 0;
        for (let i = b * passo; i < Math.min(d.length, (b + 1) * passo); i += 8) p = Math.max(p, Math.abs(d[i]));
        valores.push(p);
        max = Math.max(max, p);
      }
      valores = valores.map((v) => v / max);
    }
    const larg = w / barras;
    valores.forEach((v, b) => {
      const a = Math.max(1.5, v * h * 0.45);
      g.globalAlpha = b / barras <= progresso ? 1 : 0.45;
      g.fillStyle = cor;
      g.fillRect(b * larg + larg * 0.2, h / 2 - a, Math.max(1, larg * 0.6), a * 2);
    });
    g.globalAlpha = 1;
  }, [buffer, cor, progresso, ao_vivo]);
  return <canvas ref={tela} className="onda onda-simples" aria-hidden />;
}
