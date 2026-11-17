import { Link } from "react-router-dom";
import { capaExemplo } from "../exemplos";
import type { Cena } from "../tipos";
import { formatarTempo } from "../util";

export default function CartaoCena({ cena }: { cena: Cena }) {
  const capa = capaExemplo(cena);
  return (
    <Link to={`/cena/${cena.id}`} className="cartao cartao-cena">
      <div className="capa">{capa ? <img src={capa} alt="" loading="lazy" /> : <span aria-hidden>🎬</span>}</div>
      <div className="corpo">
        <h3>{cena.titulo}</h3>
        <div className="linha pequeno suave">
          <span>{formatarTempo(cena.duracaoMs, false)}</span>·<span>{cena.falas.length} falas</span>·
          <span>{cena.personagens.length} papéis</span>
        </div>
        <div className="linha">
          {cena.exemplo ? <span className="etiqueta">Exemplo</span> : <span className="etiqueta">Minha cena</span>}
          {!cena.fundo && <span className="etiqueta" title="Sem trilha de fundo">Sem fundo</span>}
        </div>
      </div>
    </Link>
  );
}
