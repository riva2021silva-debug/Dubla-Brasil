import { Link } from "react-router-dom";
import { useUrlDaMidia } from "../ganchos";
import { estaPublicada, type Cena } from "../tipos";
import { formatarTempo } from "../util";

export function Capa({ cena }: { cena: Cena }) {
  const capa = useUrlDaMidia(cena.capa);
  return <div className="capa">{capa ? <img src={capa} alt="" loading="lazy" /> : <span aria-hidden>🎬</span>}</div>;
}

export default function CartaoCena({ cena, para }: { cena: Cena; para?: string }) {
  return (
    <Link to={para ?? `/cena/${cena.id}`} className="cartao cartao-cena">
      <Capa cena={cena} />
      <div className="corpo">
        <h3>{cena.titulo}</h3>
        <div className="linha pequeno suave">
          <span>{formatarTempo(cena.duracaoMs, false)}</span>·
          <span>
            {cena.falas.length} {cena.falas.length === 1 ? "fala" : "falas"}
          </span>
          ·
          <span>
            {cena.personagens.length} {cena.personagens.length === 1 ? "papel" : "papéis"}
          </span>
        </div>
        {!estaPublicada(cena) && (
          <div className="linha">
            <span className="etiqueta">Oculta</span>
          </div>
        )}
      </div>
    </Link>
  );
}
