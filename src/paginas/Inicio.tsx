import { Link } from "react-router-dom";
import CartaoCena from "../componentes/CartaoCena";
import { CENAS_EXEMPLO } from "../exemplos";

export default function Inicio() {
  return (
    <>
      <section className="heroi">
        <div>
          <img className="logo-heroi" src="marca/logo.webp" alt="Dubla Brasil AI — Sua voz. Seu talento. Sua dublagem." width={900} height={600} />
        </div>
        <div>
          <h1>
            Sua voz no lugar <span className="destaque">da dublagem.</span>
          </h1>
          <p className="suave" style={{ fontSize: "1.15rem", maxWidth: 560 }}>
            Escolha uma cena, pegue um papel e grave fala por fala. A trilha sonora continua tocando por baixo e, no
            fim, você assiste ao resultado e baixa o vídeo.
          </p>
          <div className="linha" style={{ marginTop: 18 }}>
            <Link className="botao botao-primario botao-grande" to="/cenas">
              Escolher uma cena →
            </Link>
            <Link className="botao botao-grande" to="/editor">
              Criar minha cena
            </Link>
          </div>
        </div>
      </section>

      {CENAS_EXEMPLO[0] && (
        <section style={{ marginBottom: 24 }}>
          <h2>Comece por aqui</h2>
          <div className="grade">
            <CartaoCena cena={CENAS_EXEMPLO[0]} />
          </div>
        </section>
      )}

      <section className="cartao">
        <h2>Como funciona</h2>
        <div className="passos">
          <div className="passo">
            <h3>Escolha a cena</h3>
            <p className="suave">Use uma cena de exemplo ou crie a sua com um vídeo e as legendas.</p>
          </div>
          <div className="passo">
            <h3>Pegue um papel</h3>
            <p className="suave">Dublar um personagem ou vários: você decide quem vai ter a sua voz.</p>
          </div>
          <div className="passo">
            <h3>Grave fala por fala</h3>
            <p className="suave">O vídeo toca, a contagem aparece e você fala na hora certa. Regrave quantas vezes quiser.</p>
          </div>
          <div className="passo">
            <h3>Assista e baixe</h3>
            <p className="suave">Veja a sua dublagem sobre as imagens e baixe o vídeo pronto para compartilhar.</p>
          </div>
        </div>
        <p className="info pequeno" style={{ marginTop: 16 }}>
          🎧 Use fones de ouvido: assim o microfone grava só a sua voz, e não o som do vídeo.
        </p>
      </section>
    </>
  );
}
