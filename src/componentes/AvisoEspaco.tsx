import { definirLimiteDoPlano, GB, limiteDoPlano, type AvisoEspaco } from "../espaco";

/** Aviso no topo da Administração: o servidor está enchendo, hora de liberar espaço. */
export default function AvisoEspacoBanner({ aviso, aoLiberar }: { aviso: AvisoEspaco | null; aoLiberar: () => void }) {
  if (!aviso?.avisar) return null;
  const pro = limiteDoPlano() >= 100 * GB;
  return (
    <div className="aviso-espaco" role="alert">
      <div>
        <b>🧹 Hora de liberar espaço</b>
        <div className="pequeno">{aviso.texto}</div>
        {aviso.fracao !== null && (
          <div className="barra-espaco" aria-hidden>
            <span style={{ width: `${Math.min(100, Math.round(aviso.fracao * 100))}%` }} />
          </div>
        )}
      </div>
      <div className="linha" style={{ gap: 8, flexWrap: "wrap" }}>
        <button className="botao botao-primario" onClick={aoLiberar}>
          🧹 Liberar espaço
        </button>
        {aviso.fracao !== null && (
          <label className="pequeno suave linha" style={{ gap: 6 }}>
            Plano do servidor:
            <select value={pro ? "pro" : "gratis"} onChange={(e) => definirLimiteDoPlano(e.target.value === "pro" ? 100 * GB : GB)}>
              <option value="gratis">Grátis (1 GB)</option>
              <option value="pro">Pro (100 GB)</option>
            </select>
          </label>
        )}
      </div>
    </div>
  );
}
