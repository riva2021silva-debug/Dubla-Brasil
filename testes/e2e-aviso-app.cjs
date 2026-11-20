// Aviso "Baixe o app" (versão 5.2): aparece no site; o ✕ fecha; numa nova visita volta. Não aparece no estúdio.
const { chromium, devices } = require("playwright");
const path = require("path");
const BASE = process.argv[2] || "http://localhost:4174/";
(async () => {
  const nav = await chromium.launch();
  const erros = [];
  // Android: botão Baixar com o APK.
  const ctxA = await nav.newContext({ ...devices["Pixel 7"] });
  const a = await ctxA.newPage();
  a.on("pageerror", (e) => erros.push(String(e)));
  await a.goto(BASE + "#/cenas");
  await a.getByText("📲 Baixe o app Dubla Brasil").waitFor();
  const href = await a.getByRole("link", { name: "Baixar" }).getAttribute("href");
  console.log("Android: aviso com o botão Baixar (APK):", /\/baixar\/DublaBrasilAI\.apk$/.test(href) ? "ok" : `FALHOU (${href})`);
  await a.screenshot({ path: path.join(__dirname, "saida", "aviso-app-android.png") });
  await a.getByRole("button", { name: "Fechar aviso de baixar o app" }).click();
  await a.getByText("📲 Baixe o app Dubla Brasil").waitFor({ state: "detached" });
  await a.goto(BASE + "#/jogos");
  await a.waitForTimeout(500);
  console.log("✕ fecha o aviso (e não volta enquanto navega):", (await a.getByText("📲 Baixe o app Dubla Brasil").count()) === 0 ? "ok" : "FALHOU");
  const nova = await ctxA.newPage(); // nova visita (outra aba)
  await nova.goto(BASE + "#/cenas");
  await nova.getByText("📲 Baixe o app Dubla Brasil").waitFor();
  console.log("Numa nova visita o aviso volta: ok");
  // iPhone: explica "Adicionar à Tela de Início".
  const i = await (await nav.newContext({ ...devices["iPhone 13"] })).newPage();
  await i.goto(BASE + "#/cenas");
  await i.getByRole("button", { name: "Como?" }).click();
  await i.getByText(/Adicionar à Tela de Início/).waitFor();
  console.log("iPhone: explica como adicionar à tela de início: ok");
  // Computador.
  const c = await (await nav.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await c.goto(BASE + "#/cenas");
  await c.getByText("📱 Use o Dubla Brasil no celular").waitFor();
  console.log("Computador: convida a usar no celular: ok");
  // Galeria (tela cheia): sem o aviso.
  await nova.goto(BASE + "#/galeria");
  await nova.waitForTimeout(800);
  console.log("Na Galeria (tela cheia) o aviso não aparece:", (await nova.getByText("📲 Baixe o app Dubla Brasil").count()) === 0 ? "ok" : "FALHOU");
  console.log(erros.length ? "ERROS:\n" + erros.join("\n") : "Sem erros no console.");
  await nav.close();
})().catch((e) => { console.error("FALHOU:", e); process.exit(1); });
