import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAdmin } from "../admin";
import { abrirFora } from "../atualizacao";
import { apagarMinhaConta, criarConta, dataBr, emailDaConta, entrarNaConta, linkDeCheckout, PRECO, sairDaConta, usePlano } from "../plano";

/** Página de venda do Premium. */
export default function Premium() {
  const plano = usePlano();
  const navegar = useNavigate();
  const [aviso, setAviso] = useState<string | null>(null);

  const assinar = async () => {
    setAviso(null);
    const email = await emailDaConta();
    if (!email) {
      navegar("/conta?depois=premium");
      return;
    }
    const link = linkDeCheckout(email);
    if (!link) {
      setAviso("O pagamento ainda está sendo configurado. Volte em breve!");
      return;
    }
    await abrirFora(link);
    setAviso("Depois de pagar, volte aqui: o Premium é liberado em alguns minutos.");
  };

  return (
    <div className="pilha premium">
      <Link to="/conta" className="pequeno">
        ← Minha conta
      </Link>
      <section className="premium-topo">
        <div className="premium-selo">⭐ PREMIUM</div>
        <h1>Dubla Brasil Premium</h1>
        <p className="premium-preco">
          <b>{PRECO}</b>
          <span>/mês</span>
        </p>
        <p className="suave">Cancele quando quiser.</p>
      </section>

      <ul className="premium-lista">
        <li>
          <span aria-hidden>🎙️</span>
          <div>
            <b>Dublagens ilimitadas</b>
            <p className="suave pequeno">No plano grátis são 3 por dia.</p>
          </div>
        </li>
        <li>
          <span aria-hidden>✨</span>
          <div>
            <b>Vídeos sem marca d'água</b>
            <p className="suave pequeno">Salve e publique seus dubs limpinhos.</p>
          </div>
        </li>
        <li>
          <span aria-hidden>💜</span>
          <div>
            <b>Apoie o Dubla Brasil</b>
            <p className="suave pequeno">Mais cenas e novidades toda semana.</p>
          </div>
        </li>
      </ul>

      {plano.premium ? (
        <p className="info">
          ✅ Você já é Premium{plano.premiumAte ? ` até ${dataBr(plano.premiumAte)}` : ""}. Aproveite!
        </p>
      ) : (
        <button className="botao botao-primario botao-grande" onClick={() => void assinar()}>
          ⭐ Assinar por {PRECO}/mês
        </button>
      )}
      {aviso && <p className="info">{aviso}</p>}
    </div>
  );
}

/** Minha conta: plano atual, uso de hoje e login com e-mail. */
export function Conta() {
  const plano = usePlano();
  const admin = useAdmin();
  const [busca] = useSearchParams();
  const navegar = useNavigate();
  const [email, setEmail] = useState<string | null>(null);
  const [modo, setModo] = useState<"entrar" | "criar">("criar");
  const [campoEmail, setCampoEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);

  const excluir = async () => {
    setErro(null);
    setOcupado(true);
    try {
      await apagarMinhaConta();
      setEmail(null);
      setConfirmarExclusao(false);
      setAviso("Sua conta e seus dados foram apagados.");
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  };

  useEffect(() => {
    void emailDaConta().then(setEmail);
  }, [admin.email]);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setAviso(null);
    setOcupado(true);
    try {
      if (modo === "entrar") await entrarNaConta(campoEmail, senha);
      else if ((await criarConta(campoEmail, senha)) === "confirmar") {
        setAviso("Enviamos um link de confirmação para o seu e-mail. Confirme e depois toque em “Entrar”.");
        setModo("entrar");
        return;
      }
      setEmail(await emailDaConta());
      setSenha("");
      if (busca.get("depois") === "premium") navegar("/premium");
    } catch (e2) {
      setErro(e2 instanceof Error ? e2.message : String(e2));
    } finally {
      setOcupado(false);
    }
  };

  const restantes = Math.max(0, plano.limite - plano.usadasHoje);

  return (
    <div className="pilha" style={{ maxWidth: 520 }}>
      <h1 style={{ marginBottom: 0 }}>Minha conta</h1>

      <section className={`cartao pilha plano-cartao ${plano.premium ? "premium-ativo" : ""}`}>
        {plano.premium ? (
          <>
            <b>⭐ Plano Premium</b>
            <span className="suave">
              Dublagens ilimitadas e vídeos sem marca d'água{plano.premiumAte ? ` · até ${dataBr(plano.premiumAte)}` : ""}.
            </span>
          </>
        ) : (
          <>
            <b>Plano grátis</b>
            <span className="suave">
              {plano.ativo
                ? `${restantes} de ${plano.limite} dublagens grátis restantes hoje · vídeos com marca d'água`
                : "Vídeos com marca d'água"}
            </span>
            <Link to="/premium" className="botao botao-primario" style={{ alignSelf: "flex-start" }}>
              ⭐ Seja Premium · {PRECO}/mês
            </Link>
          </>
        )}
      </section>

      {email ? (
        <section className="cartao pilha">
          <span>
            Conectado como <b>{email}</b>
          </span>
          <button className="botao botao-pequeno" style={{ alignSelf: "flex-start" }} onClick={() => void sairDaConta().then(() => setEmail(null))}>
            Sair da conta
          </button>
          {erro && <p className="alerta">{erro}</p>}
          {!admin.aberto &&
            (confirmarExclusao ? (
              <div className="cartao pilha" style={{ borderColor: "var(--perigo)" }}>
                <b>Excluir a conta de vez?</b>
                <span className="suave pequeno">
                  Apaga seu apelido, seus dubs publicados, comentários e curtidas. Não dá para desfazer. Se você assina o Premium,
                  cancele também a cobrança na loja ou na plataforma de pagamento.
                </span>
                <div className="linha">
                  <button className="botao botao-perigo" disabled={ocupado} onClick={() => void excluir()}>
                    Sim, excluir minha conta
                  </button>
                  <button className="botao" onClick={() => setConfirmarExclusao(false)}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button className="botao-link pequeno" style={{ alignSelf: "flex-start" }} onClick={() => setConfirmarExclusao(true)}>
                Excluir minha conta
              </button>
            ))}
        </section>
      ) : (
        <form className="cartao pilha" onSubmit={(e) => void enviar(e)}>
          {busca.get("depois") === "premium" && <p className="info">Crie sua conta (ou entre) para assinar. Assim o Premium vale em qualquer celular.</p>}
          <div className="abas" role="tablist">
            <button type="button" role="tab" aria-selected={modo === "criar"} className={modo === "criar" ? "ativa" : ""} onClick={() => setModo("criar")}>
              Criar conta
            </button>
            <button type="button" role="tab" aria-selected={modo === "entrar"} className={modo === "entrar" ? "ativa" : ""} onClick={() => setModo("entrar")}>
              Entrar
            </button>
          </div>
          <label className="campo">
            E-mail
            <input id="conta-email" className="entrada" type="email" autoComplete="email" required value={campoEmail} onChange={(e) => setCampoEmail(e.target.value)} />
          </label>
          <label className="campo">
            Senha
            <input
              id="conta-senha"
              className="entrada"
              type="password"
              autoComplete={modo === "criar" ? "new-password" : "current-password"}
              required
              minLength={6}
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
            />
          </label>
          {erro && <p className="alerta">{erro}</p>}
          {aviso && <p className="info">{aviso}</p>}
          <button className="botao botao-primario" disabled={ocupado}>
            {ocupado ? "Aguarde…" : modo === "criar" ? "Criar conta" : "Entrar"}
          </button>
        </form>
      )}
    </div>
  );
}
