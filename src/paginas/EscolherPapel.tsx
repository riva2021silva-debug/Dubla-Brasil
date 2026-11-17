import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { db, excluirCenaCompleta } from "../db";
import { buscarCena, dubsDaCena, useCarregar, useMidiasDaCena } from "../ganchos";
import { exportarPacote } from "../pacote";
import type { Dub } from "../tipos";
import { baixarArquivo, dataCurta, formatarTempo, nomeArquivo, novoId } from "../util";

export default function EscolherPapel() {
  const { id = "" } = useParams();
  const cena = useCarregar(() => buscarCena(id), [id]);
  const dubs = useCarregar(() => dubsDaCena(id), [id]);
  const { urls } = useMidiasDaCena(cena.dado);
  const [papeis, setPapeis] = useState<string[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const navegar = useNavigate();

  if (cena.carregando) return <p className="suave">Carregando…</p>;
  const c = cena.dado;
  if (!c)
    return (
      <div className="vazio">
        <h2>Cena não encontrada</h2>
        <p>Ela pode ter sido excluída ou criada em outro navegador.</p>
        <Link className="botao" to="/cenas">
          Ver cenas
        </Link>
      </div>
    );

  const alternar = (pid: string) =>
    setPapeis((atual) => (atual.includes(pid) ? atual.filter((x) => x !== pid) : [...atual, pid]));

  const comecar = async () => {
    const agora = Date.now();
    const nomes = c.personagens.filter((p) => papeis.includes(p.id)).map((p) => p.nome);
    const dub: Dub = {
      id: novoId(),
      cenaId: c.id,
      papeis,
      tomadas: {},
      nome: `${c.titulo} — ${nomes.join(" e ")}`,
      criadoEm: agora,
      atualizadoEm: agora,
    };
    await db.salvarDub(dub);
    navegar(`/estudio/${dub.id}`);
  };

  const falasPorPapel = (pid: string) => c.falas.filter((f) => f.personagemId === pid).length;

  return (
    <div className="duas-colunas">
      <div className="pilha">
        <div className="palco">{urls && <video src={urls.video} controls playsInline preload="metadata" />}</div>
        <div>
          <h1>{c.titulo}</h1>
          {c.descricao && <p className="suave">{c.descricao}</p>}
          <div className="linha pequeno suave">
            <span>{formatarTempo(c.duracaoMs, false)}</span>·<span>{c.idioma}</span>·<span>{c.falas.length} falas</span>
            {!c.fundo && <span className="etiqueta">Sem trilha de fundo</span>}
          </div>
        </div>
        {!c.exemplo && (
          <div className="linha">
            <Link className="botao botao-pequeno" to={`/editor/${c.id}`}>
              ✏️ Editar cena
            </Link>
            <button
              className="botao botao-pequeno"
              disabled={ocupado}
              onClick={async () => {
                setOcupado(true);
                try {
                  baixarArquivo(await exportarPacote(c), `${nomeArquivo(c.titulo)}.dubla`);
                } finally {
                  setOcupado(false);
                }
              }}
            >
              📦 Exportar pacote
            </button>
            <button
              className="botao botao-pequeno botao-perigo"
              onClick={async () => {
                if (!confirm(`Excluir a cena "${c.titulo}" e todos os dubs dela? Isso não pode ser desfeito.`)) return;
                await excluirCenaCompleta(c);
                navegar("/cenas");
              }}
            >
              Excluir cena
            </button>
          </div>
        )}
      </div>

      <div className="pilha">
        <section className="cartao pilha">
          <h2>Quem você vai dublar?</h2>
          <p className="suave pequeno" style={{ margin: 0 }}>
            Escolha um ou mais personagens. Os outros continuam com a voz original.
          </p>
          {c.personagens.length === 0 && <p className="alerta">Esta cena ainda não tem personagens.</p>}
          {c.personagens.map((p) => (
            <button
              key={p.id}
              className={`papel ${papeis.includes(p.id) ? "escolhido" : ""}`}
              aria-pressed={papeis.includes(p.id)}
              onClick={() => alternar(p.id)}
            >
              <span className="avatar" style={{ background: p.cor }}>
                {p.nome.slice(0, 1).toUpperCase()}
              </span>
              <span style={{ flex: 1 }}>
                <strong>{p.nome}</strong>
                <br />
                <span className="suave pequeno">{falasPorPapel(p.id)} {falasPorPapel(p.id) === 1 ? "fala" : "falas"}</span>
              </span>
              <span aria-hidden>{papeis.includes(p.id) ? "✅" : "○"}</span>
            </button>
          ))}
          <button className="botao botao-primario botao-grande" disabled={papeis.length === 0} onClick={comecar}>
            🎙️ Ir para o estúdio
          </button>
        </section>

        <section className="cartao pilha">
          <h3>Seus dubs desta cena</h3>
          {(dubs.dado ?? []).length === 0 ? (
            <p className="suave pequeno" style={{ margin: 0 }}>
              Nenhum ainda.
            </p>
          ) : (
            dubs.dado!.map((d) => {
              const minhas = c.falas.filter((f) => d.papeis.includes(f.personagemId));
              const feitas = minhas.filter((f) => d.tomadas[f.id]).length;
              return (
                <div key={d.id} className="linha entre">
                  <span>
                    <strong>{c.personagens.filter((p) => d.papeis.includes(p.id)).map((p) => p.nome).join(", ")}</strong>
                    <br />
                    <span className="suave pequeno">
                      {feitas}/{minhas.length} falas · {dataCurta(d.atualizadoEm)}
                    </span>
                  </span>
                  <span className="linha">
                    <Link className="botao botao-pequeno" to={`/estudio/${d.id}`}>
                      Estúdio
                    </Link>
                    <Link className="botao botao-pequeno botao-verde" to={`/dub/${d.id}`}>
                      ▶ Assistir
                    </Link>
                  </span>
                </div>
              );
            })
          )}
        </section>
      </div>
    </div>
  );
}
