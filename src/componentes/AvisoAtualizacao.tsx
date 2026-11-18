import { useEffect, useState } from "react";
import {
  adiar,
  atualizar,
  CODIGO_APP,
  estaAdiada,
  plataforma,
  primeiraVezNestaVersao,
  VERSAO_APP,
  versaoPublicada,
  type VersaoPublicada,
} from "../atualizacao";

/** Pede para conferir agora (usado pelo botão "Procurar atualização" nas Configurações). */
export const procurarAtualizacao = () => window.dispatchEvent(new Event("dubla:procurar-atualizacao"));

/** Avisa quando há uma versão nova (e mostra as novidades uma vez depois de atualizar). */
export default function AvisoAtualizacao() {
  const [nova, setNova] = useState<VersaoPublicada | null>(null);
  const [novidades, setNovidades] = useState<VersaoPublicada | null>(null);
  const [baixando, setBaixando] = useState(false);

  useEffect(() => {
    let vivo = true;
    const conferir = async (forcar = false) => {
      const v = await versaoPublicada();
      if (!vivo) return;
      if (v && v.codigo > CODIGO_APP && (forcar || !estaAdiada(v.codigo))) setNova(v);
      else if (forcar) setNova({ versao: VERSAO_APP, codigo: CODIGO_APP, novidades: [] });
    };
    void conferir();
    // O que mudou nesta versão (uma vez, logo depois de atualizar).
    if (primeiraVezNestaVersao()) {
      void fetch(`./versao.json?t=${Date.now()}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((v: VersaoPublicada | null) => vivo && v && v.codigo === CODIGO_APP && setNovidades(v))
        .catch(() => {});
    }
    const aoVoltar = () => document.visibilityState === "visible" && void conferir();
    const aoPedir = () => void conferir(true);
    const intervalo = setInterval(() => void conferir(), 30 * 60e3);
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("dubla:procurar-atualizacao", aoPedir);
    return () => {
      vivo = false;
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("dubla:procurar-atualizacao", aoPedir);
    };
  }, []);

  if (nova && nova.codigo <= CODIGO_APP)
    return (
      <Janela titulo="✅ Você está na versão mais nova" aoFechar={() => setNova(null)}>
        <p className="suave" style={{ margin: 0 }}>
          Dubla Brasil AI versão {VERSAO_APP}.
        </p>
        <button className="botao botao-primario" onClick={() => setNova(null)}>
          Ok
        </button>
      </Janela>
    );

  if (nova) {
    const ios = plataforma() === "ios";
    return (
      <Janela titulo={`🎉 Atualização ${nova.versao} disponível`} aoFechar={() => (adiar(nova.codigo), setNova(null))}>
        <p className="suave" style={{ margin: 0 }}>
          Você está na versão {VERSAO_APP}. Veja o que tem de novo:
        </p>
        <ListaNovidades itens={nova.novidades} />
        {ios ? (
          <p className="info" style={{ margin: 0 }}>
            Atualize pelo TestFlight ou pela App Store.
          </p>
        ) : (
          <button
            className="botao botao-primario botao-grande"
            disabled={baixando}
            onClick={() => {
              setBaixando(true);
              void atualizar(nova).finally(() => setBaixando(false));
            }}
          >
            {plataforma() === "android" ? "⬇ Baixar a atualização" : "🔄 Atualizar agora"}
          </button>
        )}
        {plataforma() === "android" && (
          <p className="suave pequeno" style={{ margin: 0 }}>
            Depois de baixar, toque no arquivo e em <b>Atualizar</b>. Seus dubs e sua conta continuam.
          </p>
        )}
        <button className="botao" onClick={() => (adiar(nova.codigo), setNova(null))}>
          Depois
        </button>
      </Janela>
    );
  }

  if (novidades)
    return (
      <Janela titulo={`✨ Novidades da versão ${novidades.versao}`} aoFechar={() => setNovidades(null)}>
        <ListaNovidades itens={novidades.novidades} />
        <button className="botao botao-primario" onClick={() => setNovidades(null)}>
          Legal!
        </button>
      </Janela>
    );

  return null;
}

function ListaNovidades({ itens }: { itens: string[] }) {
  if (!itens.length) return null;
  return (
    <ul className="lista-novidades">
      {itens.map((n) => (
        <li key={n}>{n}</li>
      ))}
    </ul>
  );
}

function Janela(props: { titulo: string; aoFechar: () => void; children: React.ReactNode }) {
  return (
    <div className="fundo-modal" role="dialog" aria-modal="true" aria-labelledby="titulo-atualizacao" onClick={(e) => e.target === e.currentTarget && props.aoFechar()}>
      <div className="cartao pilha modal aviso-atualizacao">
        <h2 id="titulo-atualizacao" style={{ margin: 0 }}>
          {props.titulo}
        </h2>
        {props.children}
      </div>
    </div>
  );
}
