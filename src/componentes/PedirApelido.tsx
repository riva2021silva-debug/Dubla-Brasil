import { useState, type FormEvent } from "react";
import { APELIDO_VALIDO, definirApelido } from "../galeria";

/** Janela que pede o apelido na primeira vez que a pessoa publica ou comenta. */
export default function PedirApelido({ aoConfirmar, aoFechar }: { aoConfirmar: (apelido: string) => void; aoFechar: () => void }) {
  const [apelido, setApelido] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErro(null);
    if (!APELIDO_VALIDO.test(apelido.trim())) return setErro("Use de 3 a 20 letras, números, ponto ou _ (sem espaços).");
    setSalvando(true);
    try {
      aoConfirmar(await definirApelido(apelido));
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fundo-modal" role="dialog" aria-modal="true" aria-labelledby="titulo-apelido" onClick={(e) => e.target === e.currentTarget && aoFechar()}>
      <form className="cartao pilha modal" onSubmit={enviar}>
        <h2 id="titulo-apelido" style={{ margin: 0 }}>
          Escolha seu apelido
        </h2>
        <p className="suave" style={{ margin: 0 }}>
          É o nome que aparece na galeria nos seus dubs e comentários. Não precisa de e-mail nem senha.
        </p>
        <label className="campo">
          Apelido
          <input
            id="apelido"
            className="entrada"
            value={apelido}
            maxLength={20}
            autoComplete="nickname"
            placeholder="ex.: voz_de_ouro"
            onChange={(e) => setApelido(e.target.value.replace(/\s/g, ""))}
            autoFocus
          />
        </label>
        {erro && <p className="alerta" style={{ margin: 0 }}>{erro}</p>}
        <div className="linha">
          <button className="botao botao-primario" type="submit" disabled={salvando}>
            {salvando ? "Salvando…" : "Continuar"}
          </button>
          <button className="botao" type="button" onClick={aoFechar}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
