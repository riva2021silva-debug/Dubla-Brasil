import { Link } from "react-router-dom";

const JOGOS = [
  {
    rota: "/jogos/voz-no-alvo",
    emoji: "🎯",
    nome: "Voz no Alvo",
    descricao: "Controle a bolinha com o tom da voz e passe pelos vãos sem bater.",
  },
  {
    rota: "/imitar",
    emoji: "🦜",
    nome: "Imitação",
    descricao: "Ouça um som, imite e receba uma nota de 0 a 100.",
  },
];

export default function Jogos() {
  return (
    <>
      <h1>Jogos de voz</h1>
      <p className="suave" style={{ marginTop: 0 }}>
        Jogos rápidos para brincar só com a voz. Use fones de ouvido.
      </p>
      <div className="grade-sons">
        {JOGOS.map((j) => (
          <Link key={j.rota} to={j.rota} className="cartao cartao-som">
            <span className="emoji-som" aria-hidden>
              {j.emoji}
            </span>
            <strong>{j.nome}</strong>
            <span className="suave pequeno">{j.descricao}</span>
            <span className="etiqueta">▶ Jogar</span>
          </Link>
        ))}
      </div>
    </>
  );
}
