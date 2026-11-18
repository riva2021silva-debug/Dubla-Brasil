/** Foto do perfil de quem usa o app; sem foto, mostra a inicial do apelido num círculo colorido. */
export default function FotoPerfil({ apelido, foto, tamanho = 44, className = "" }: { apelido: string; foto: string | null; tamanho?: number; className?: string }) {
  // Cor fixa por apelido (a mesma pessoa sempre com a mesma cor).
  let h = 0;
  for (const c of apelido) h = (h * 31 + c.charCodeAt(0)) % 360;
  return (
    <span
      className={`foto-perfil ${className}`}
      style={{ width: tamanho, height: tamanho, fontSize: tamanho * 0.44, background: foto ? "#111" : `linear-gradient(135deg, hsl(${h} 75% 55%), hsl(${(h + 50) % 360} 80% 45%))` }}
      aria-hidden
    >
      {foto ? <img src={foto} alt="" loading="lazy" /> : apelido.slice(0, 1).toUpperCase()}
    </span>
  );
}
