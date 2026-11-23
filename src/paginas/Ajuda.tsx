import { useState } from "react";
import { Link } from "react-router-dom";
import { enviarMensagem, minhasMensagens, quando, TIPOS, type TipoMensagem } from "../ajuda";
import { useCarregar } from "../ganchos";

const STATUS = { nova: "Enviada", lida: "Vista pelo suporte", resolvida: "Resolvida" } as const;

/** Ajuda: a pessoa conta o problema e a mensagem chega direto no administrador. */
export default function Ajuda() {
  const minhas = useCarregar(() => minhasMensagens(), []);
  const [tipo, setTipo] = useState<TipoMensagem>("problema");
  const [texto, setTexto] = useState("");
  const [contato, setContato] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await enviarMensagem(tipo, texto, contato);
      setTexto("");
      setEnviado(true);
      minhas.recarregar();
    } catch (e2) {
      setErro(e2 instanceof Error ? e2.message : String(e2));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="pilha" style={{ maxWidth: 560 }}>
      <h1 style={{ marginBottom: 0 }}>Ajuda</h1>
      <p className="suave" style={{ margin: 0 }}>
        Algo não está funcionando? Conte para a gente. A mensagem vai direto para a equipe do Dubla Brasil.
      </p>
      <Link to="/novidades" className="pequeno">
        🆕 Veja tudo o que mudou no app (Novidades)
      </Link>

      <form className="cartao pilha" onSubmit={(e) => void enviar(e)}>
        <div className="tipos-ajuda" role="radiogroup" aria-label="Assunto">
          {TIPOS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={tipo === t.id}
              className={`tipo-ajuda ${tipo === t.id ? "ativo" : ""}`}
              onClick={() => setTipo(t.id)}
            >
              <span aria-hidden>{t.emoji}</span> {t.nome}
            </button>
          ))}
        </div>
        <label className="campo">
          {tipo === "problema" ? "O que aconteceu? Em qual tela?" : "Sua mensagem"}
          <textarea
            id="texto-ajuda"
            className="entrada"
            rows={5}
            maxLength={2000}
            required
            minLength={5}
            value={texto}
            placeholder={tipo === "problema" ? "Ex.: no estúdio, quando aperto para gravar, o vídeo trava…" : "Escreva aqui…"}
            onChange={(e) => {
              setTexto(e.target.value);
              setEnviado(false);
            }}
          />
        </label>
        <label className="campo">
          Contato para resposta (opcional)
          <input id="contato-ajuda" className="entrada" maxLength={120} value={contato} placeholder="E-mail ou WhatsApp" onChange={(e) => setContato(e.target.value)} />
        </label>
        <p className="suave pequeno" style={{ margin: 0 }}>
          Junto vão a versão do app e o modelo do aparelho, para ajudar a achar o problema.
        </p>
        {erro && <p className="alerta">{erro}</p>}
        {enviado && <p className="info">✅ Mensagem enviada! A resposta aparece aqui embaixo, em “Minhas mensagens”.</p>}
        <button className="botao botao-primario" disabled={enviando || texto.trim().length < 5}>
          {enviando ? "Enviando…" : "📨 Enviar mensagem"}
        </button>
      </form>

      {(minhas.dado?.length ?? 0) > 0 && (
        <section className="pilha">
          <h2 style={{ margin: 0 }}>Minhas mensagens</h2>
          {minhas.dado!.map((m) => (
            <article key={m.id} className="cartao pilha mensagem-ajuda">
              <div className="linha entre">
                <span className="etiqueta">
                  {TIPOS.find((t) => t.id === m.tipo)?.emoji} {TIPOS.find((t) => t.id === m.tipo)?.nome}
                </span>
                <span className={`status-ajuda s-${m.status}`}>{STATUS[m.status]}</span>
              </div>
              <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{m.texto}</p>
              <span className="suave pequeno">{quando(m.criada_em)}</span>
              {m.resposta && (
                <div className="resposta-ajuda">
                  <b>💬 Resposta do Dubla Brasil:</b>
                  <p style={{ margin: "4px 0 0", whiteSpace: "pre-wrap" }}>{m.resposta}</p>
                </div>
              )}
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
