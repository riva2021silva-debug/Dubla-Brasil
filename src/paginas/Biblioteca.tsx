import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import CartaoCena from "../componentes/CartaoCena";
import { todasAsCenas, useCarregar } from "../ganchos";
import { GENEROS } from "../tipos";

const ICONE_GENERO: Record<string, string> = {
  Ação: "💥",
  Comédia: "😂",
  Drama: "🎭",
  Romance: "❤️",
  Terror: "👻",
  Anime: "🍥",
  Desenho: "🖍️",
  "Super-heróis": "🦸",
  "Séries e novelas": "📺",
  Memes: "🤣",
  Infantil: "🧸",
};

type Ordem = "recentes" | "titulo" | "curtas" | "falas";

export default function Biblioteca() {
  const cenas = useCarregar(() => todasAsCenas(), []);
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<Ordem>("recentes");
  const [params, setParams] = useSearchParams();
  const tipo = (params.get("tipo") as "cena" | "musica" | null) ?? "todas";
  const temMusicas = (cenas.dado ?? []).some((c) => c.tipo === "musica");
  // Categorias (versão 5.8): só aparecem as que têm cena; idioma só quando há mais de um.
  const genero = params.get("genero");
  const idioma = params.get("idioma");
  const generos = useMemo(() => GENEROS.filter((g) => (cenas.dado ?? []).some((c) => c.genero === g)), [cenas.dado]);
  const idiomas = useMemo(() => [...new Set((cenas.dado ?? []).map((c) => c.idioma).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")), [cenas.dado]);
  const mudarFiltro = (chave: string, valor: string | null) => {
    const n = new URLSearchParams(params);
    if (valor) n.set(chave, valor);
    else n.delete(chave);
    setParams(n);
  };

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const lista = (cenas.dado ?? [])
      .filter((c) => tipo === "todas" || (tipo === "musica" ? c.tipo === "musica" : c.tipo !== "musica"))
      .filter((c) => !genero || c.genero === genero)
      .filter((c) => !idioma || c.idioma === idioma)
      .filter((c) =>
      !q
        ? true
        : [c.titulo, c.descricao, ...c.personagens.map((p) => p.nome)].join(" ").toLowerCase().includes(q),
    );
    const cmp: Record<Ordem, (a: (typeof lista)[0], b: (typeof lista)[0]) => number> = {
      recentes: (a, b) => b.atualizadaEm - a.atualizadaEm,
      titulo: (a, b) => a.titulo.localeCompare(b.titulo, "pt-BR"),
      curtas: (a, b) => a.duracaoMs - b.duracaoMs,
      falas: (a, b) => a.falas.length - b.falas.length,
    };
    return [...lista].sort(cmp[ordem]);
  }, [cenas.dado, busca, ordem, tipo, genero, idioma]);

  return (
    <>
      <h1>{tipo === "musica" ? "🎤 Músicas" : "Cenas"}</h1>
      {(temMusicas || tipo !== "todas") && (
        <div className="filtro-tipo" role="group" aria-label="Mostrar" style={{ marginBottom: 12 }}>
          {(
            [
              ["todas", "Tudo"],
              ["cena", "🎬 Dublar cenas"],
              ["musica", "🎤 Cantar músicas"],
            ] as const
          ).map(([v, rotulo]) => (
            <button key={v} className={tipo === v ? "ativo" : ""} aria-pressed={tipo === v} onClick={() => mudarFiltro("tipo", v === "todas" ? null : v)}>
              {rotulo}
            </button>
          ))}
        </div>
      )}
      {generos.length > 0 && (
        <div className="filtro-categorias" role="group" aria-label="Categorias">
          <button className={!genero ? "ativo" : ""} aria-pressed={!genero} onClick={() => mudarFiltro("genero", null)}>
            Todas
          </button>
          {generos.map((g) => (
            <button key={g} className={genero === g ? "ativo" : ""} aria-pressed={genero === g} onClick={() => mudarFiltro("genero", genero === g ? null : g)}>
              {ICONE_GENERO[g] ?? ""} {g}
            </button>
          ))}
        </div>
      )}
      <div className="linha" style={{ marginBottom: 18 }}>
        <input
          id="busca-cenas"
          className="entrada"
          style={{ maxWidth: 380, flex: 1 }}
          type="search"
          placeholder="Buscar por título ou personagem…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          aria-label="Buscar cenas"
        />
        <select id="ordem-cenas" className="entrada" style={{ width: "auto" }} value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)} aria-label="Ordenar">
          <option value="recentes">Mais recentes</option>
          <option value="titulo">Título (A–Z)</option>
          <option value="curtas">Mais curtas</option>
          <option value="falas">Menos falas</option>
        </select>
        {idiomas.length > 1 && (
          <select id="idioma-cenas" className="entrada" style={{ width: "auto" }} value={idioma ?? ""} onChange={(e) => mudarFiltro("idioma", e.target.value || null)} aria-label="Idioma">
            <option value="">Todos os idiomas</option>
            {idiomas.map((i) => (
              <option key={i}>{i}</option>
            ))}
          </select>
        )}
        <span className="suave pequeno">
          {visiveis.length} {visiveis.length === 1 ? "cena" : "cenas"}
        </span>
      </div>

      {cenas.erro && <p className="alerta">{cenas.erro}</p>}
      {cenas.carregando ? (
        <p className="suave">Carregando…</p>
      ) : visiveis.length === 0 ? (
        <div className="cartao vazio">
          <p style={{ margin: 0 }}>{busca || genero || idioma ? "Nenhuma cena encontrada com esses filtros." : "Nenhuma cena disponível ainda."}</p>
        </div>
      ) : (
        <div className="grade">
          {visiveis.map((c) => (
            <CartaoCena key={c.id} cena={c} />
          ))}
        </div>
      )}
    </>
  );
}
