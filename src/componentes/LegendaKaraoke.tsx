import type { Fala, Personagem } from "../tipos";

/**
 * Legenda em português embaixo do vídeo, no estilo karaokê: o texto vai sendo preenchido conforme o tempo
 * da fala passa. Fora das falas, mostra a próxima fala de quem está dublando, para ir se preparando.
 */
export default function LegendaKaraoke({
  falas,
  personagens,
  tempoMs,
  papeis,
  proxima,
}: {
  falas: Fala[];
  personagens: Personagem[];
  tempoMs: number;
  papeis: string[];
  proxima?: Fala | null;
}) {
  const agora = falas.find((f) => tempoMs >= f.inicioMs && tempoMs < f.fimMs);
  const f = agora ?? (proxima && tempoMs < proxima.inicioMs && proxima.inicioMs - tempoMs < 3000 ? proxima : null);
  if (!f || !f.texto.trim()) return null;
  const p = personagens.find((x) => x.id === f.personagemId);
  const minha = papeis.includes(f.personagemId);
  const progresso = agora ? Math.min(1, (tempoMs - f.inicioMs) / Math.max(1, f.fimMs - f.inicioMs)) : 0;
  return (
    <div className={`legenda-karaoke ${minha ? "minha" : ""} ${agora ? "" : "em-breve"}`} aria-live="polite">
      <span className="quem" style={{ color: p?.cor }}>
        {minha ? "🎙️ Sua fala" : p?.nome}
        {!agora && " · já já"}
      </span>
      <span className="texto-karaoke" style={{ "--progresso": `${progresso * 100}%` } as React.CSSProperties}>
        {f.texto}
      </span>
    </div>
  );
}
