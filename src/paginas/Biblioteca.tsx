import { useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import CartaoCena from "../componentes/CartaoCena";
import { todasAsCenas, useCarregar } from "../ganchos";
import { importarPacote } from "../pacote";

type Filtro = "todas" | "minhas" | "exemplos";

export default function Biblioteca() {
  const cenas = useCarregar(todasAsCenas, []);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [importando, setImportando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const arquivo = useRef<HTMLInputElement>(null);
  const navegar = useNavigate();

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (cenas.dado ?? []).filter((c) => {
      if (filtro === "minhas" && c.exemplo) return false;
      if (filtro === "exemplos" && !c.exemplo) return false;
      if (!q) return true;
      return [c.titulo, c.descricao, ...c.personagens.map((p) => p.nome), ...c.falas.map((f) => f.texto)]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [cenas.dado, busca, filtro]);

  const importar = async (f: File) => {
    setErro(null);
    setImportando(true);
    try {
      const c = await importarPacote(f);
      navegar(`/cena/${c.id}`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setImportando(false);
    }
  };

  return (
    <>
      <div className="linha entre" style={{ marginBottom: 16 }}>
        <div>
          <h1>Cenas</h1>
          <p className="suave" style={{ margin: 0 }}>
            Escolha uma cena para dublar.
          </p>
        </div>
        <div className="linha">
          <button className="botao" onClick={() => arquivo.current?.click()} disabled={importando}>
            {importando ? "Importando…" : "📦 Importar pacote"}
          </button>
          <Link className="botao botao-primario" to="/editor">
            + Criar cena
          </Link>
          <input
            ref={arquivo}
            type="file"
            accept=".dubla,.zip"
            className="oculto"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void importar(f);
            }}
          />
        </div>
      </div>

      <div className="linha" style={{ marginBottom: 18 }}>
        <input
          className="entrada"
          style={{ maxWidth: 380 }}
          type="search"
          placeholder="Buscar por título, personagem ou fala…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          aria-label="Buscar cenas"
        />
        <div className="abas" role="tablist">
          {(
            [
              ["todas", "Todas"],
              ["minhas", "Minhas cenas"],
              ["exemplos", "Exemplos"],
            ] as const
          ).map(([v, rotulo]) => (
            <button key={v} role="tab" aria-selected={filtro === v} className={filtro === v ? "ativa" : ""} onClick={() => setFiltro(v)}>
              {rotulo}
            </button>
          ))}
        </div>
      </div>

      {erro && <p className="alerta">{erro}</p>}
      {cenas.erro && <p className="alerta">{cenas.erro}</p>}
      {cenas.carregando ? (
        <p className="suave">Carregando…</p>
      ) : visiveis.length === 0 ? (
        <div className="vazio">
          <p>Nenhuma cena encontrada.</p>
          <Link className="botao botao-primario" to="/editor">
            Criar uma cena
          </Link>
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
