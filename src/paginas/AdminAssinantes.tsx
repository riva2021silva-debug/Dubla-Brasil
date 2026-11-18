import { useState } from "react";
import { useCarregar } from "../ganchos";
import { dataBr, definirPremium, listarAssinantes } from "../plano";
import { listarPagamentos, quando } from "../ajuda";

/** Assinantes Premium: lista e liberação manual (por e-mail ou @apelido). */
export default function AdminAssinantes() {
  const lista = useCarregar(() => listarAssinantes(), []);
  const pagamentos = useCarregar(() => listarPagamentos(), []);
  const [busca, setBusca] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const agora = Date.now();
  const itens = lista.dado ?? [];
  const ativos = itens.filter((a) => new Date(a.premium_ate).getTime() > agora).length;

  const aplicar = async (alvo: string, dias: number) => {
    if (!alvo.trim()) return;
    setErro(null);
    setAviso(null);
    setOcupado(true);
    try {
      const ate = await definirPremium(alvo, dias);
      setAviso(ate ? `✅ ${alvo.trim()} é Premium até ${dataBr(ate)}.` : `Premium retirado de ${alvo.trim()}.`);
      setBusca("");
      lista.recarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="pilha">
      <p className="suave" style={{ margin: 0 }}>
        {ativos} {ativos === 1 ? "assinante ativo" : "assinantes ativos"} · R$ 19,90/mês cada
      </p>
      <section className="cartao pilha">
        <b>Liberar Premium manualmente</b>
        <span className="suave pequeno">Use para cortesias, testes ou se um pagamento não liberar sozinho.</span>
        <label className="campo">
          E-mail ou @apelido
          <input id="busca-assinante" className="entrada" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="ex.: maria@email.com ou @voz_de_ouro" />
        </label>
        <div className="linha">
          <button className="botao botao-primario" disabled={ocupado || !busca.trim()} onClick={() => void aplicar(busca, 30)}>
            ⭐ Dar 30 dias
          </button>
          <button className="botao" disabled={ocupado || !busca.trim()} onClick={() => void aplicar(busca, 0)}>
            Tirar Premium
          </button>
        </div>
        {erro && <p className="alerta">{erro}</p>}
        {aviso && <p className="info">{aviso}</p>}
      </section>
      {lista.erro && <p className="alerta">{lista.erro}</p>}
      {lista.carregando ? (
        <p className="suave">Carregando…</p>
      ) : itens.length === 0 ? (
        <div className="cartao vazio">Nenhum assinante ainda.</div>
      ) : (
        <ul className="lista-assinantes">
          {itens.map((a) => {
            const ativo = new Date(a.premium_ate).getTime() > agora;
            const nome = a.email ?? (a.apelido ? `@${a.apelido}` : a.user_id.slice(0, 8));
            return (
              <li key={a.user_id} className="cartao linha entre">
                <div>
                  <b>{nome}</b>
                  {a.email && a.apelido && <span className="suave"> · @{a.apelido}</span>}
                  <div className="suave pequeno">
                    {ativo ? "Ativo" : "Vencido"} até {dataBr(a.premium_ate)} · {a.origem === "manual" ? "liberado pelo admin" : a.origem}
                  </div>
                </div>
                <button className="botao botao-pequeno" disabled={ocupado} onClick={() => void aplicar(a.email ?? `@${a.apelido}`, 30)} aria-label={`Mais 30 dias para ${nome}`}>
                  +30 dias
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <section className="cartao pilha">
        <div className="linha entre">
          <b>💳 Avisos da Cakto</b>
          <button className="botao botao-pequeno" onClick={() => pagamentos.recarregar()}>
            Atualizar
          </button>
        </div>
        <span className="suave pequeno">Cada pagamento, renovação, cancelamento ou reembolso que a Cakto avisar aparece aqui.</span>
        {pagamentos.erro && <p className="alerta">{pagamentos.erro}</p>}
        {(pagamentos.dado ?? []).length === 0 ? (
          <span className="suave">Nenhum aviso recebido ainda.</span>
        ) : (
          <ul className="lista-pagamentos">
            {pagamentos.dado!.map((p, i) => (
              <li key={i} className={p.valido ? "" : "recusado"}>
                <span>
                  <b>{p.evento ?? "?"}</b> · {p.email || "sem e-mail"}
                </span>
                <span className="suave pequeno">
                  {quando(p.recebido_em)} · {p.resultado}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
