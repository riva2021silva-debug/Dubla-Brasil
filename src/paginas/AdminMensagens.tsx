import { useState } from "react";
import { apagarMensagem, atualizarMensagem, listarMensagens, quando, TIPOS, type Mensagem } from "../ajuda";
import { useCarregar } from "../ganchos";

/** Mensagens de Ajuda: o administrador lê, responde e marca como resolvida. */
export default function AdminMensagens({ aoMudar }: { aoMudar?: () => void }) {
  const [filtro, setFiltro] = useState<"abertas" | "todas">("abertas");
  const lista = useCarregar(() => listarMensagens(filtro), [filtro]);
  const [erro, setErro] = useState<string | null>(null);
  const itens = lista.dado ?? [];

  const executar = async (fn: () => Promise<unknown>) => {
    setErro(null);
    try {
      await fn();
      lista.recarregar();
      aoMudar?.();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="pilha">
      <div className="linha entre">
        <p className="suave" style={{ margin: 0 }}>
          {(() => {
            const n = itens.filter((m) => m.status === "nova").length;
            return `${n} ${n === 1 ? "nova" : "novas"} · ${itens.length} ${filtro === "abertas" ? (itens.length === 1 ? "aberta" : "abertas") : "no total"}`;
          })()}
        </p>
        <div className="linha" style={{ gap: 6 }}>
          <button className={`botao botao-pequeno ${filtro === "abertas" ? "botao-primario" : ""}`} onClick={() => setFiltro("abertas")}>
            Abertas
          </button>
          <button className={`botao botao-pequeno ${filtro === "todas" ? "botao-primario" : ""}`} onClick={() => setFiltro("todas")}>
            Todas
          </button>
        </div>
      </div>
      {erro && <p className="alerta">{erro}</p>}
      {lista.erro && <p className="alerta">{lista.erro}</p>}
      {lista.carregando ? (
        <p className="suave">Carregando…</p>
      ) : itens.length === 0 ? (
        <div className="cartao vazio">{filtro === "abertas" ? "Nenhuma mensagem esperando resposta. 🎉" : "Nenhuma mensagem ainda."}</div>
      ) : (
        itens.map((m) => <ItemMensagem key={m.id} m={m} executar={executar} />)
      )}
    </div>
  );
}

function ItemMensagem({ m, executar }: { m: Mensagem; executar: (fn: () => Promise<unknown>) => Promise<void> }) {
  const [resposta, setResposta] = useState(m.resposta ?? "");
  const [confirmar, setConfirmar] = useState(false);
  const tipo = TIPOS.find((t) => t.id === m.tipo);
  return (
    <article className={`cartao pilha mensagem-ajuda ${m.status === "nova" ? "nova" : ""}`}>
      <div className="linha entre">
        <span className="etiqueta">
          {tipo?.emoji} {tipo?.nome}
        </span>
        <span className={`status-ajuda s-${m.status}`}>{m.status === "nova" ? "🔴 Nova" : m.status === "lida" ? "Lida" : "✅ Resolvida"}</span>
      </div>
      <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{m.texto}</p>
      <div className="suave pequeno">
        {quando(m.criada_em)} · versão {m.versao ?? "?"}
        {m.contato && (
          <>
            {" "}
            · contato: <b>{m.contato}</b>
          </>
        )}
        {m.aparelho && <div>{m.aparelho}</div>}
      </div>
      <label className="campo">
        Resposta (a pessoa vê em Ajuda → Minhas mensagens)
        <textarea className="entrada" rows={2} maxLength={2000} value={resposta} onChange={(e) => setResposta(e.target.value)} aria-label="Resposta" />
      </label>
      <div className="linha" style={{ gap: 6 }}>
        <button
          className="botao botao-pequeno botao-primario"
          disabled={!resposta.trim() || resposta === (m.resposta ?? "")}
          onClick={() => void executar(() => atualizarMensagem(m.id, { resposta: resposta.trim(), status: "resolvida" }))}
        >
          💬 Responder e resolver
        </button>
        {m.status === "nova" && (
          <button className="botao botao-pequeno" onClick={() => void executar(() => atualizarMensagem(m.id, { status: "lida" }))}>
            Marcar como lida
          </button>
        )}
        {m.status !== "resolvida" && (
          <button className="botao botao-pequeno" onClick={() => void executar(() => atualizarMensagem(m.id, { status: "resolvida" }))}>
            ✅ Resolvida
          </button>
        )}
        {confirmar ? (
          <button className="botao botao-pequeno botao-perigo" onClick={() => void executar(() => apagarMensagem(m.id))}>
            Confirmar exclusão
          </button>
        ) : (
          <button className="botao botao-pequeno botao-perigo" onClick={() => setConfirmar(true)}>
            Apagar
          </button>
        )}
      </div>
    </article>
  );
}
