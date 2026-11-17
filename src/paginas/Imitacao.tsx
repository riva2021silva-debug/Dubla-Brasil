import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { db } from "../db";
import { listarSons } from "../nuvem";
import { useCarregar } from "../ganchos";
import { formatarTempo } from "../util";

export default function Imitacao() {
  const dados = useCarregar(async () => {
    const [sons, imitacoes] = await Promise.all([listarSons(), db.listarImitacoes()]);
    return { sons, imitacoes };
  }, []);
  const [categoria, setCategoria] = useState("Todas");
  const sons = dados.dado?.sons ?? [];
  const notas = useMemo(() => new Map((dados.dado?.imitacoes ?? []).map((i) => [i.somId, i.nota])), [dados.dado]);
  const categorias = ["Todas", ...new Set(sons.map((s) => s.categoria))];
  const visiveis = sons.filter((s) => categoria === "Todas" || s.categoria === categoria);

  return (
    <>
      <h1>Imitação</h1>
      <p className="suave" style={{ marginTop: 0 }}>
        Ouça um som, grave a sua versão e veja a nota. Ganha mais quem acerta o ritmo e a melodia da voz.
      </p>
      {categorias.length > 2 && (
        <div className="abas" style={{ marginBottom: 16 }}>
          {categorias.map((c) => (
            <button key={c} className={categoria === c ? "ativa" : ""} onClick={() => setCategoria(c)}>
              {c}
            </button>
          ))}
        </div>
      )}
      {dados.carregando ? (
        <p className="suave">Carregando…</p>
      ) : dados.erro ? (
        <p className="alerta">{dados.erro}</p>
      ) : visiveis.length === 0 ? (
        <div className="cartao vazio">
          <p style={{ margin: 0 }}>Nenhum som disponível ainda.</p>
          <p className="pequeno">Os sons são adicionados pelo administrador.</p>
        </div>
      ) : (
        <div className="grade-sons">
          {visiveis.map((s) => {
            const nota = notas.get(s.id);
            return (
              <Link key={s.id} to={`/imitar/${s.id}`} className="cartao cartao-som">
                <span className="emoji-som" aria-hidden>
                  {s.emoji || "🔊"}
                </span>
                <strong>{s.titulo}</strong>
                <span className="suave pequeno">
                  {s.categoria} · {formatarTempo(s.duracaoMs)}
                </span>
                {nota !== undefined ? <span className="etiqueta etiqueta-ok">Melhor nota: {nota}</span> : <span className="etiqueta">Novo</span>}
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
