import { useState } from "react";
import { apagarPublicacao, listarParaLimpeza, type Publicacao } from "../galeria";
import { EVENTO_ESPACO } from "../espaco";

const DIAS = 60;
const MAX_CURTIDAS = 2;

/**
 * Admin: libera espaço no servidor apagando dubs antigos que quase ninguém curtiu. Primeiro mostra quais seriam
 * apagados; só apaga depois que o administrador confirma (apagar não tem volta). Quem publicou continua com o dub
 * no próprio celular, em "Meus dubs".
 */
export default function LimparGaleria({ aoTerminar }: { aoTerminar: () => void }) {
  const [lista, setLista] = useState<Publicacao[] | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const procurar = async () => {
    setMsg(null);
    setOcupado(true);
    try {
      setLista(await listarParaLimpeza(DIAS, MAX_CURTIDAS));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  };

  const apagar = async () => {
    if (!lista?.length) return;
    setOcupado(true);
    let feitos = 0;
    for (const p of lista) {
      try {
        await apagarPublicacao(p);
        feitos++;
        setMsg(`Apagando… ${feitos} de ${lista.length}`);
      } catch {
        /* segue com os outros */
      }
    }
    setMsg(`✅ ${feitos} ${feitos === 1 ? "dub apagado" : "dubs apagados"}. Espaço liberado no servidor.`);
    setLista(null);
    setOcupado(false);
    window.dispatchEvent(new Event(EVENTO_ESPACO)); // o aviso de espaço confere de novo
    aoTerminar();
  };

  return (
    <section className="cartao pilha" style={{ gap: 8 }}>
      <div className="linha entre" style={{ flexWrap: "wrap", gap: 8 }}>
        <div>
          <b>🧹 Liberar espaço</b>
          <div className="suave pequeno">
            Dubs com mais de {DIAS} dias e até {MAX_CURTIDAS} curtidas. Quem publicou continua com o dub no celular (Meus dubs).
          </div>
        </div>
        {!lista && (
          <button className="botao" disabled={ocupado} onClick={() => void procurar()}>
            {ocupado ? "Procurando…" : "🔍 Ver quais seriam apagados"}
          </button>
        )}
      </div>
      {lista && lista.length === 0 && <p className="suave pequeno" style={{ margin: 0 }}>Nenhum dub antigo para apagar. ✅</p>}
      {lista && lista.length > 0 && (
        <>
          <ul className="lista-otimizar" aria-label="Dubs que seriam apagados">
            {lista.slice(0, 20).map((p) => (
              <li key={p.id}>
                <b>@{p.apelido}</b> <span className="suave">· {p.cenaTitulo} · 👍 {p.curtidas} · {new Date(p.criadaEm).toLocaleDateString("pt-BR")}</span>
              </li>
            ))}
            {lista.length > 20 && <li className="suave">…e mais {lista.length - 20}</li>}
          </ul>
          <div className="linha" style={{ gap: 8 }}>
            <button className="botao botao-perigo" disabled={ocupado} onClick={() => void apagar()}>
              🗑 Apagar {lista.length} {lista.length === 1 ? "dub" : "dubs"}
            </button>
            <button className="botao" disabled={ocupado} onClick={() => setLista(null)}>
              Cancelar
            </button>
          </div>
        </>
      )}
      {msg && <p className="suave pequeno" style={{ margin: 0 }}>{msg}</p>}
    </section>
  );
}
