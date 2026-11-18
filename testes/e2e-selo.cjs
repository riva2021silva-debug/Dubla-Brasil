// Teste do selo de fora (versão 3.4): simula o "Powered by Netlify" no rodapé (como no iPhone) e confere que a barra
// de botões sobe acima dele, sem nada ficar por baixo — e que sem selo a barra continua colada embaixo.
const { chromium, devices } = require("playwright");
const path = require("path");
const BASE = process.argv[2] || "http://localhost:4174/";
const SAIDA = path.join(__dirname, "saida");

(async () => {
  const navegador = await chromium.launch();
  const erros = [];
  const nova = async () => {
    const pg = await (await navegador.newContext({ ...devices["iPhone 13"] })).newPage();
    pg.on("pageerror", (e) => erros.push(String(e)));
    return pg;
  };
  const caixa = (p, sel) => p.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; }, sel);

  const semSelo = await nova();
  await semSelo.goto(BASE + "#/");
  await semSelo.locator(".barra-inferior").waitFor();
  await semSelo.waitForTimeout(800);
  const vh = await semSelo.evaluate(() => innerHeight);
  const b0 = await caixa(semSelo, ".barra-inferior");
  console.log("Sem selo: barra colada embaixo:", Math.abs(b0.bottom - vh) < 2 ? "ok" : `FALHOU (${b0.bottom} de ${vh})`);

  for (const tipo of ["comum", "shadow"]) {
    const p = await nova();
    await p.goto(BASE + "#/");
    await p.locator(".barra-inferior").waitFor();
    // Selo parecido com o do Netlify: pílula fixa no canto de baixo à direita, por fora do app.
    await p.evaluate((tipo) => {
      const host = document.createElement("div");
      const pilula = document.createElement("a");
      pilula.textContent = "Powered by Netlify";
      pilula.id = "selo-teste";
      Object.assign(pilula.style, { position: "fixed", right: "14px", bottom: "16px", height: "44px", padding: "0 18px", display: "flex", alignItems: "center", borderRadius: "22px", background: "#0e1e25", color: "#fff", zIndex: "999999", font: "600 15px system-ui" });
      if (tipo === "shadow") host.attachShadow({ mode: "open" }).appendChild(pilula);
      else host.appendChild(pilula);
      document.body.appendChild(host);
      window.__selo = () => (tipo === "shadow" ? host.shadowRoot.getElementById("selo-teste") : pilula).getBoundingClientRect();
    }, tipo);
    await p.waitForFunction(() => document.documentElement.classList.contains("com-selo-externo"), null, { timeout: 8000 });
    await p.waitForTimeout(300);
    const barra = await caixa(p, ".barra-inferior");
    const selo = await p.evaluate(() => { const r = window.__selo(); return { top: r.top, bottom: r.bottom }; });
    if (tipo === "comum") await p.screenshot({ path: path.join(SAIDA, "selo-iphone.png") });
    if (tipo === "comum") {
      // Gaveta de comentários (sobe do rodapé): o botão Enviar tem que ficar acima do selo.
      const enviar = await p.evaluate(() => {
        const fundo = document.createElement("div");
        fundo.className = "fundo-modal gaveta-fundo";
        fundo.innerHTML = '<div class="gaveta"><b>0 comentários</b><div class="linha"><input class="entrada" style="flex:1"><button class="botao botao-primario" id="enviar-teste">Enviar</button></div></div>';
        document.getElementById("root").appendChild(fundo);
        const r = document.getElementById("enviar-teste").getBoundingClientRect();
        return { bottom: r.bottom };
      });
      await p.screenshot({ path: path.join(SAIDA, "selo-comentarios.png") });
      console.log(`Comentários: botão Enviar termina em ${enviar.bottom.toFixed(0)} px, selo começa em ${selo.top.toFixed(0)} px:`, enviar.bottom <= selo.top ? "ok (acima do selo)" : "FALHOU");
    }
    console.log(`Com selo (${tipo}): barra termina em ${barra.bottom.toFixed(0)} px, selo começa em ${selo.top.toFixed(0)} px:`, barra.bottom <= selo.top + 1 ? "ok (sem sobrepor)" : "FALHOU");
  }
  console.log(erros.length ? "ERROS:\n" + erros.join("\n") : "Sem erros no console.");
  await navegador.close();
})().catch((e) => {
  console.error("FALHOU:", e);
  process.exit(1);
});
