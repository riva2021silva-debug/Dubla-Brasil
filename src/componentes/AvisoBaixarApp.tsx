import { useState } from "react";
import { useLocation } from "react-router-dom";
import { noAplicativo } from "../util";

const CHAVE = "dubla-brasil:aviso-app-fechado";

type Sistema = "android" | "iphone" | "computador";
function sistema(): Sistema {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "iphone";
  if (/Android/i.test(ua)) return "android";
  return "computador";
}
/** Já está como app (instalado na tela de início do iPhone / Android)? */
const comoApp = () => noAplicativo() || window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

function fechadoNestaVisita(): boolean {
  try {
    return sessionStorage.getItem(CHAVE) === "1";
  } catch {
    return false;
  }
}

/**
 * No site (navegador), convida a baixar o app no celular. O ✕ fecha; na próxima vez que a pessoa abrir o site
 * o aviso volta. Não aparece dentro do app instalado nem no estúdio (para não tirar espaço da gravação).
 */
export default function AvisoBaixarApp() {
  const { pathname } = useLocation();
  const [fechado, setFechado] = useState(fechadoNestaVisita);
  const [verComo, setVerComo] = useState(false);
  // Estúdio (gravação numa tela só) e Galeria (vídeo em tela cheia) ficam sem o aviso.
  if (fechado || comoApp() || pathname.startsWith("/estudio") || pathname.startsWith("/galeria")) return null;
  const s = sistema();
  const apk = `${location.origin}${location.pathname.replace(/[^/]*$/, "")}baixar/DublaBrasilAI.apk`;
  const fechar = () => {
    try {
      sessionStorage.setItem(CHAVE, "1");
    } catch {
      /* sem armazenamento: só esconde agora */
    }
    setFechado(true);
  };
  return (
    <div className="aviso-baixar" role="region" aria-label="Baixe o app">
      <img src="marca/logo-pequeno.webp" alt="" width={42} height={28} />
      <div className="aviso-baixar-texto">
        <b>{s === "computador" ? "📱 Use o Dubla Brasil no celular" : "📲 Baixe o app Dubla Brasil"}</b>
        {!verComo && (
          <span className="pequeno">
            {s === "iphone" ? "Fica com ícone na tela, igual a um app." : "Grave suas dublagens direto do celular, mais rápido."}
          </span>
        )}
        {verComo && (
          <span className="pequeno">
            {s === "iphone" ? (
              <>No Safari, toque em <b>Compartilhar</b> (o quadrado com a seta ↑) e depois em <b>Adicionar à Tela de Início</b>.</>
            ) : (
              <>
                <b>Android:</b> abra este site no celular e toque em <b>Baixar</b>. <b>iPhone:</b> no Safari, toque em Compartilhar (↑) → <b>Adicionar à Tela de Início</b>.
              </>
            )}
          </span>
        )}
      </div>
      {s === "android" ? (
        <a className="botao botao-primario botao-pequeno" href={apk} download>
          Baixar
        </a>
      ) : (
        !verComo && (
          <button className="botao botao-primario botao-pequeno" onClick={() => setVerComo(true)}>
            Como?
          </button>
        )
      )}
      <button className="aviso-baixar-fechar" onClick={fechar} aria-label="Fechar aviso de baixar o app">
        ✕
      </button>
    </div>
  );
}
