import { useState } from "react";
import { Link } from "react-router-dom";
import { useCarregar } from "../ganchos";
import { apagarPublicacao, listarParaModeracao, ocultarPublicacao, tempoAtras, type Publicacao } from "../galeria";

/** Moderação da galeria: os dubs mais denunciados aparecem primeiro. */
export default function AdminGaleria() {
  const lista = useCarregar(() => listarParaModeracao(), []);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const itens = lista.dado ?? [];
  const denunciados = itens.filter((p) => p.denuncias > 0 && !p.oculta).length;

  const executar = async (fn: () => Promise<unknown>) => {
    setErro(null);
    try {
      await fn();
      lista.recarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="pilha">
      <p className="suave" style={{ margin: 0 }}>
        {itens.length} {itens.length === 1 ? "dub publicado" : "dubs publicados"} · {itens.filter((p) => p.oculta).length} ocultos
        {denunciados > 0 && (
          <>
            {" "}
            · <b style={{ color: "var(--perigo)" }}>{denunciados} com denúncia para revisar</b>
          </>
        )}
      </p>
      {erro && <p className="alerta">{erro}</p>}
      {lista.erro && <p className="alerta">{lista.erro}</p>}
      {lista.carregando ? (
        <p className="suave">Carregando…</p>
      ) : itens.length === 0 ? (
        <div className="cartao vazio">
          <p style={{ margin: 0 }}>Nenhum dub publicado na galeria ainda.</p>
        </div>
      ) : (
        <div className="cartao pilha" style={{ padding: 8 }}>
          {itens.map((p: Publicacao) => (
            <div key={p.id} className="linha-admin">
              <div className="miniatura">
                <div className="capa">{p.capa ? <img src={p.capa} alt="" crossOrigin="anonymous" /> : <span aria-hidden>🎬</span>}</div>
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="linha" style={{ gap: 8 }}>
                  <strong className="titulo-admin">@{p.apelido}</strong>
                  <span className={`etiqueta ${p.oculta ? "" : "etiqueta-ok"}`}>{p.oculta ? "Oculto" : "Na galeria"}</span>
                  {p.denuncias > 0 && <span className="etiqueta" style={{ color: "var(--perigo)", borderColor: "var(--perigo)" }}>⚑ {p.denuncias}</span>}
                </div>
                <div className="suave pequeno">
                  {p.cenaTitulo} · {tempoAtras(p.criadaEm)} · 👍 {p.curtidas} · 👎 {p.descurtidas} · 💬 {p.comentarios}
                </div>
              </div>
              <div className="linha acoes-admin">
                <Link className="botao botao-pequeno" to={`/galeria?p=${p.id}`}>
                  ▶ Ver
                </Link>
                <button className={`botao botao-pequeno ${p.oculta ? "botao-verde" : ""}`} onClick={() => executar(() => ocultarPublicacao(p.id, !p.oculta))}>
                  {p.oculta ? "Mostrar" : "Ocultar"}
                </button>
                {confirmar === p.id ? (
                  <>
                    <button className="botao botao-pequeno botao-perigo" onClick={() => executar(() => apagarPublicacao(p))}>
                      Confirmar exclusão
                    </button>
                    <button className="botao botao-pequeno" onClick={() => setConfirmar(null)}>
                      Cancelar
                    </button>
                  </>
                ) : (
                  <button className="botao botao-pequeno botao-perigo" onClick={() => setConfirmar(p.id)} aria-label={`Apagar dub de ${p.apelido}`}>
                    🗑
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
