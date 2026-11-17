import type { Personagem } from "../tipos";

/** Foto redonda do personagem; sem foto, mostra a inicial na cor dele. */
export default function Avatar({ personagem, tamanho = 44, foto }: { personagem: Personagem; tamanho?: number; foto?: string | null }) {
  const url = foto !== undefined ? foto : personagem.foto;
  return (
    <span
      className="avatar"
      style={{ width: tamanho, height: tamanho, background: personagem.cor, fontSize: tamanho * 0.42, boxShadow: `0 0 0 2px ${personagem.cor}` }}
      aria-hidden
    >
      {url ? <img src={url} alt="" crossOrigin="anonymous" /> : personagem.nome.slice(0, 1).toUpperCase()}
    </span>
  );
}
