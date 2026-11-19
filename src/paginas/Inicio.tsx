import { Link } from "react-router-dom";
import CartaoCena from "../componentes/CartaoCena";
import { todasAsCenas, useCarregar } from "../ganchos";

export default function Inicio() {
  const cenas = useCarregar(() => todasAsCenas(), []);
  const novas = (cenas.dado ?? []).slice(0, 6);

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
            {(cenas.dado ?? []).some((c) => c.tipo === "musica") && (
              <Link className="botao botao-grande" to="/cenas?tipo=musica">
                🎤 Cantar
              </Link>
            )}
            <Link className="botao botao-grande" to="/meus-dubs">
              Meus dubs
            </Link>
          </div>
        </div>
      </section>

      <section style={{ marginBottom: 24 }}>
        <div className="linha entre" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>Cenas novas</h2>
          {novas.length > 0 && (
            <Link to="/cenas" className="pequeno">
              Ver todas →
            </Link>
          )}
        </div>
        {cenas.carregando ? (
          <p className="suave">Carregando…</p>
        ) : novas.length === 0 ? (
          <div className="cartao vazio">
            <p style={{ marginTop: 0 }}>Nenhuma cena disponível ainda.</p>
            <p className="pequeno" style={{ margin: 0 }}>
              As cenas são adicionadas pelo administrador.
            </p>
          </div>
        ) : (
          <div className="grade">
            {novas.map((c) => (
              <CartaoCena key={c.id} cena={c} />
            ))}
          </div>
        )}
      </section>

      <section className="cartao">
        <h2>Como funciona</h2>
        <div className="passos">
          <div className="passo">
            <h3>Escolha a cena</h3>
            <p className="suave">Navegue pelas cenas e escolha a que você quer dublar.</p>
          </div>
          <div className="passo">
            <h3>Pegue um papel</h3>
            <p className="suave">Dublar um personagem ou vários: você decide quem vai ter a sua voz.</p>
          </div>
          <div className="passo">
            <h3>Grave fala por fala</h3>
            <p className="suave">Ouça o original, grave na contagem e ouça a sua tomada. Regrave quantas vezes quiser.</p>
          </div>
          <div className="passo">
            <h3>Assista e baixe</h3>
            <p className="suave">Veja a sua dublagem sobre as imagens e compartilhe o vídeo pronto.</p>
          </div>
        </div>
        <p className="info pequeno" style={{ marginTop: 16, marginBottom: 0 }}>
          🎧 Use fones de ouvido: assim o microfone grava só a sua voz, e não o som do vídeo.
        </p>
      </section>
    </>
  );
}
