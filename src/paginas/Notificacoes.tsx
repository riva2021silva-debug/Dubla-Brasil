import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { tempoAtras } from "../galeria";
import { useAdmin } from "../admin";
import { useAvisoEspaco } from "../espaco";
import { frase, icone, limparNotificacoes, listarNotificacoes, marcarComoLida, marcarTodasComoLidas, type Notificacao } from "../notificacoes";

export default function Notificacoes() {
  const [lista, setLista] = useState<Notificacao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const navegar = useNavigate();
  const { aberto } = useAdmin();
  const espaco = useAvisoEspaco(aberto);

  useEffect(() => {
    let vivo = true;
    listarNotificacoes()
      .then((l) => {
        if (!vivo) return;
        setLista(l);
        // Abriu a tela: tudo passa a contar como visto (as novas continuam destacadas até sair).
        if (l.some((n) => !n.lida)) void marcarTodasComoLidas();
      })
      .catch((e) => vivo && setErro(e instanceof Error ? e.message : String(e)));
    return () => {
      vivo = false;
    };
  }, []);

  const abrir = (n: Notificacao) => {
    if (!n.lida) void marcarComoLida(n.id);
    if (n.publicacaoId) navegar(`/galeria?p=${n.publicacaoId}`);
  };

  return (
    <div className="pilha" style={{ maxWidth: 640, margin: "0 auto" }}>
      <div className="linha entre">
        <h1 style={{ margin: 0 }}>🔔 Notificações</h1>
        {!!lista?.length && (
          <button
            className="botao botao-pequeno"
            onClick={() => {
              if (!confirm("Apagar todas as notificações?")) return;
              void limparNotificacoes().then(() => setLista([]));
            }}
          >
            Limpar
          </button>
        )}
      </div>
      {espaco?.avisar && (
        <button className="notificacao nova" onClick={() => navegar("/admin?aba=galeria")}>
          <span className="notificacao-icone" aria-hidden>
            🧹
          </span>
          <span className="notificacao-corpo">
            <span>
              <strong>Hora de liberar espaço no servidor</strong>
            </span>
            <span className="notificacao-texto">{espaco.texto}</span>
            <span className="suave pequeno">Toque para abrir o “Liberar espaço” (só o administrador vê este aviso)</span>
          </span>
        </button>
      )}
      {erro && <p className="alerta">{erro}</p>}
      {!lista && !erro && <p className="suave">Carregando…</p>}
      {lista && lista.length === 0 && (
        <div className="vazio">
          <div style={{ fontSize: 44 }} aria-hidden>
            🔔
          </div>
          <h2>Nada por aqui ainda</h2>
          <p className="suave">Quando alguém curtir, comentar ou dublar junto com um dub seu, o aviso aparece aqui.</p>
          <Link className="botao botao-primario" to="/galeria">
            Ver a galeria
          </Link>
        </div>
      )}
      {lista && lista.length > 0 && (
        <ul className="lista-notificacoes" aria-label="Notificações">
          {lista.map((n) => (
            <li key={n.id}>
              <button className={`notificacao ${n.lida ? "" : "nova"}`} onClick={() => abrir(n)}>
                <span className="notificacao-icone" aria-hidden>
                  {icone(n.tipo)}
                </span>
                <span className="notificacao-corpo">
                  <span>
                    <strong>@{n.deApelido ?? "Alguém"}</strong> {frase(n)}
                  </span>
                  {n.texto && <span className="notificacao-texto">“{n.texto}”</span>}
                  <span className="suave pequeno">{tempoAtras(n.criadaEm)}</span>
                </span>
                {!n.lida && <span className="ponto-novo" aria-label="nova" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
