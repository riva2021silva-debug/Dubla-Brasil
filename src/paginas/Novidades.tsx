import { Link } from "react-router-dom";
import { NOVIDADES } from "../novidades";

/** Tudo o que mudou no app, da versão mais nova para a mais antiga. */
export default function Novidades() {
  return (
    <div className="pilha" style={{ maxWidth: 720, margin: "0 auto" }}>
      <h1 style={{ margin: 0 }}>🆕 Novidades</h1>
      <p className="suave" style={{ margin: 0 }}>
        Tudo o que mudou no Dubla Brasil, da versão mais nova para a mais antiga.
      </p>
      {NOVIDADES.map((v, i) => (
        <section key={v.versao} className="cartao pilha novidade" style={{ gap: 6 }}>
          <div className="linha" style={{ gap: 8, flexWrap: "wrap" }}>
            <b>Versão {v.versao}</b>
            {i === 0 && <span className="etiqueta">mais nova</span>}
            {v.quando && <span className="suave pequeno">· {v.quando}</span>}
          </div>
          <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 4 }}>
            {v.itens.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </section>
      ))}
      <Link className="botao" to="/" style={{ alignSelf: "flex-start" }}>
        Voltar ao início
      </Link>
    </div>
  );
}
