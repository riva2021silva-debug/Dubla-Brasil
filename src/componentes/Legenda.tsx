import type { Fala, Personagem } from "../tipos";

export function falaNoTempo(falas: Fala[], ms: number): Fala | undefined {
  return falas.find((f) => ms >= f.inicioMs && ms < f.fimMs);
}

export default function Legenda({ falas, personagens, tempoMs }: { falas: Fala[]; personagens: Personagem[]; tempoMs: number }) {
  const f = falaNoTempo(falas, tempoMs);
  if (!f || !f.texto.trim()) return null;
  const p = personagens.find((x) => x.id === f.personagemId);
  return (
    <div className="legenda">
      {p && (
        <span className="quem" style={{ color: p.cor }}>
          {p.nome}
        </span>
      )}
      {f.texto}
    </div>
  );
}
