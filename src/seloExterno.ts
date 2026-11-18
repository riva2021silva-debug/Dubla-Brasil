// Selos colocados por cima do site por fora do app (ex.: "Powered by Netlify" no plano grátis).
// O app não controla esse selo; então mede quanto ele ocupa embaixo da tela e sobe a barra de botões acima dele.
import { Capacitor } from "@capacitor/core";

const MAX_ALTURA = 160;

/** Elementos fixos perto do rodapé que não fazem parte do app (inclui os dentro de shadow DOM aberto). */
function alturaOcupadaEmbaixo(): number {
  const raiz = document.getElementById("root");
  const vh = window.innerHeight;
  let ocupado = 0;
  const olhar = (el: Element, profundidade: number) => {
    if (profundidade > 4) return;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) return;
    if (cs.position === "fixed" || cs.position === "sticky") {
      const r = el.getBoundingClientRect();
      if (r.height > 0 && r.height <= MAX_ALTURA && r.width > 0 && vh - r.bottom < 60 && r.top < vh) ocupado = Math.max(ocupado, vh - r.top);
    }
    for (const filho of Array.from(el.children).slice(0, 30)) olhar(filho, profundidade + 1);
    const sombra = (el as HTMLElement).shadowRoot;
    if (sombra) for (const filho of Array.from(sombra.children).slice(0, 30)) olhar(filho, profundidade + 1);
  };
  for (const el of Array.from(document.body.children)) {
    if (el === raiz || el.tagName === "SCRIPT" || el.tagName === "STYLE" || el.tagName === "NOSCRIPT") continue;
    olhar(el, 0);
  }
  return Math.ceil(ocupado);
}

/** Começa a vigiar (só no navegador; no app instalado não há selo). */
export function vigiarSeloExterno() {
  if (Capacitor.isNativePlatform()) return () => {};
  let ultimo = -1;
  const atualizar = () => {
    const h = alturaOcupadaEmbaixo();
    if (h === ultimo) return;
    ultimo = h;
    document.documentElement.style.setProperty("--folga-selo", `${h}px`);
    document.documentElement.classList.toggle("com-selo-externo", h > 0);
  };
  const obs = new MutationObserver(() => requestAnimationFrame(atualizar));
  obs.observe(document.body, { childList: true, subtree: false, attributes: true });
  const tempos = [0, 500, 1500, 3000, 6000].map((ms) => setTimeout(atualizar, ms));
  const intervalo = setInterval(atualizar, 4000);
  window.addEventListener("resize", atualizar);
  return () => {
    obs.disconnect();
    tempos.forEach(clearTimeout);
    clearInterval(intervalo);
    window.removeEventListener("resize", atualizar);
  };
}
