import { publicarSemTrilha, tentarDeNovo, tirarDaFila, useProcessamento } from "../processamento";

/** Admin: as cenas que o app está preparando sozinho (vídeo leve → envio → IA separa as vozes → publica). */
export default function PainelProcessamento() {
  const lista = useProcessamento();
  if (!lista.length) return null;
  const andando = lista.filter((t) => t.etapa !== "pronto" && t.etapa !== "erro").length;
  return (
    <section className="cartao pilha painel-processamento" id="processamento" style={{ gap: 8 }} aria-label="Processamento automático">
      <div className="linha entre" style={{ flexWrap: "wrap", gap: 8 }}>
        <b>{andando ? `⏳ Preparando ${andando} ${andando === 1 ? "cena" : "cenas"} sozinho` : "✅ Processamento automático"}</b>
        {andando > 0 && <span className="suave pequeno">Pode sair desta tela e adicionar outras. Só não feche o app até terminar.</span>}
      </div>
      <ul className="lista-otimizar">
        {lista.map((t) => (
          <li key={t.id} className={t.etapa === "pronto" ? "feito" : t.etapa === "erro" ? "erro" : "andando"}>
            <div className="linha entre" style={{ flexWrap: "wrap", gap: 6 }}>
              <span>
                <b>{t.titulo}</b> <span className="suave">· {t.etapa === "erro" ? `não deu: ${t.erro}` : t.detalhe}</span>
              </span>
              {t.etapa === "erro" && (
                <span className="linha" style={{ gap: 6 }}>
                  <button className="botao botao-pequeno" onClick={() => tentarDeNovo(t.id)}>
                    🔁 Tentar de novo
                  </button>
                  {t.enviado && (
                    <button className="botao botao-pequeno" onClick={() => void publicarSemTrilha(t.id)}>
                      {t.publicar ? "Publicar sem a trilha" : "Deixar sem a trilha"}
                    </button>
                  )}
                </span>
              )}
              {t.etapa === "pronto" && (
                <button className="botao botao-pequeno" onClick={() => void tirarDaFila(t.id)} aria-label={`Tirar ${t.titulo} da lista`}>
                  ✕
                </button>
              )}
            </div>
            {(t.etapa === "otimizando" || t.etapa === "separando") && (
              <div className="barra-processo" aria-hidden>
                <span style={{ width: `${Math.round(t.fracao * 100)}%` }} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
