import { useRef } from "react";
import type { Fala, Personagem } from "../tipos";

interface Props {
  duracaoMs: number;
  tempoMs: number;
  falas: Fala[];
  personagens: Personagem[];
  /** Personagens dublados por você (realçados). */
  papeis?: string[];
  feitas?: Set<string>;
  selecionada?: string | null;
  onBuscar: (ms: number) => void;
  onSelecionar?: (falaId: string) => void;
  /** Faixa recortada (editor). */
  recorte?: { inicioMs: number; fimMs: number } | null;
}

export default function LinhaDoTempo(p: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const total = Math.max(1, p.duracaoMs);
  const cor = (id: string) => p.personagens.find((x) => x.id === id)?.cor ?? "#888";

  const buscar = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    p.onBuscar(Math.max(0, Math.min(total, ((clientX - r.left) / r.width) * total)));
  };

  return (
    <div
      ref={ref}
      className="linha-tempo"
      role="slider"
      aria-label="Linha do tempo da cena"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={Math.round(p.tempoMs)}
      tabIndex={0}
      onPointerDown={(e) => {
        (e.target as Element).setPointerCapture?.(e.pointerId);
        buscar(e.clientX);
      }}
      onPointerMove={(e) => e.buttons === 1 && buscar(e.clientX)}
    >
      {p.recorte && (
        <>
          <div style={{ position: "absolute", inset: 0, right: `${100 - (p.recorte.inicioMs / total) * 100}%`, background: "rgb(0 0 0 / .55)" }} />
          <div style={{ position: "absolute", inset: 0, left: `${(p.recorte.fimMs / total) * 100}%`, background: "rgb(0 0 0 / .55)" }} />
        </>
      )}
      {p.falas.map((f) => {
        const classes = ["seg"];
        if (p.papeis?.includes(f.personagemId)) classes.push("minha");
        if (p.feitas?.has(f.id)) classes.push("feita");
        if (p.selecionada === f.id) classes.push("selecionada");
        return (
          <div
            key={f.id}
            className={classes.join(" ")}
            title={`${((f.fimMs - f.inicioMs) / 1000).toFixed(1)} s`}
            onPointerDown={(e) => {
              if (!p.onSelecionar) return;
              e.stopPropagation();
              p.onSelecionar(f.id);
            }}
            style={{
              left: `${(f.inicioMs / total) * 100}%`,
              width: `${Math.max(0.4, ((f.fimMs - f.inicioMs) / total) * 100)}%`,
              background: cor(f.personagemId),
            }}
          />
        );
      })}
      <div className="cabeca" style={{ left: `${(p.tempoMs / total) * 100}%` }} />
    </div>
  );
}
