import { Link } from "react-router-dom";
import { db } from "../db";
import { todasAsCenas, useCarregar } from "../ganchos";
import { dataCurta } from "../util";

export default function MeusDubs() {
  const dados = useCarregar(async () => {
    const [dubs, cenas] = await Promise.all([db.listarDubs(), todasAsCenas()]);
    return { dubs: dubs.sort((a, b) => b.atualizadoEm - a.atualizadoEm), cenas };
  }, []);

  if (dados.carregando) return <p className="suave">Carregando…</p>;
  const { dubs = [], cenas = [] } = dados.dado ?? {};

  return (
    <>
      <h1>Meus dubs</h1>
      <p className="suave">Tudo o que você gravou fica guardado neste navegador.</p>
      {dubs.length === 0 ? (
        <div className="vazio">
          <p>Você ainda não gravou nenhum dub.</p>
          <Link className="botao botao-primario" to="/cenas">
            Escolher uma cena
          </Link>
        </div>
      ) : (
        <div className="pilha">
          {dubs.map((d) => {
            const c = cenas.find((x) => x.id === d.cenaId);
            const minhas = c ? c.falas.filter((f) => d.papeis.includes(f.personagemId)) : [];
            const feitas = minhas.filter((f) => d.tomadas[f.id]).length;
            return (
              <div key={d.id} className="cartao linha entre">
                <div>
                  <h3 style={{ margin: 0 }}>{c ? c.titulo : "Cena removida"}</h3>
                  <span className="suave pequeno">
                    {c ? c.personagens.filter((p) => d.papeis.includes(p.id)).map((p) => p.nome).join(", ") : "—"} ·{" "}
                    {feitas}/{minhas.length} falas gravadas · {dataCurta(d.atualizadoEm)}
                  </span>
                </div>
                <div className="linha">
                  {c && (
                    <>
                      <Link className="botao botao-pequeno" to={`/estudio/${d.id}`}>
                        🎙️ Estúdio
                      </Link>
                      <Link className="botao botao-pequeno botao-verde" to={`/dub/${d.id}`}>
                        ▶ Assistir
                      </Link>
                    </>
                  )}
                  <button
                    className="botao botao-pequeno botao-perigo"
                    onClick={async () => {
                      if (!confirm("Excluir este dub? As gravações serão perdidas.")) return;
                      await db.excluirDub(d.id);
                      dados.recarregar();
                    }}
                  >
                    Excluir
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
