// Confere se, no celular, vídeo + fala + onda + botões cabem na tela do estúdio (sem rolar), com e sem legenda.
const { chromium, devices } = require("playwright");
const path = require("path");
const { entrarAdmin, criarCenaTeste } = require("./auxiliar.cjs");
const BASE = process.argv[2] || "http://localhost:4174/";
(async () => {
  const b = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
  const adm = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await entrarAdmin(adm, BASE);
  await criarCenaTeste(adm, "Cena deitada");
  const id = (await (await fetch("http://localhost:54399/__estado")).json()).cenas[0].id;
  const p = await (await b.newContext({ ...devices["Pixel 7"], permissions: ["microphone"] })).newPage();
  await p.goto(BASE + "#/cena/" + id);
  await p.getByRole("button", { name: /^Tucano/ }).click();
  await p.getByRole("button", { name: /Entrar no estúdio/ }).click();
  await p.waitForFunction(() => document.querySelector("video")?.readyState >= 2);
  const medir = () => p.evaluate(() => {
    const barra = document.querySelector(".barra-inferior").getBoundingClientRect().top;
    const fim = document.querySelector(".botoes-redondos").getBoundingClientRect().bottom;
    const video = document.querySelector(".palco").getBoundingClientRect();
    return { videoTopo: Math.round(video.top), videoAltura: Math.round(video.height), botoesTerminamEm: Math.round(fim), barraInferiorEm: Math.round(barra) };
  });
  await p.getByRole("button", { name: "Gravar esta fala" }).click();
  await p.waitForFunction(() => document.querySelector(".texto-karaoke"), null, { timeout: 8000 });
  await p.waitForTimeout(3600);
  const m1 = await medir();
  console.log("Com legenda, gravando:", JSON.stringify(m1), m1.botoesTerminamEm <= m1.barraInferiorEm && m1.videoTopo >= 0 ? "→ tudo visível ✅" : "→ precisa rolar ❌");
  await p.screenshot({ path: path.join(__dirname, "saida", "c1-compacto-legenda.png") });
  await p.getByText("Gravada ✓").waitFor({ timeout: 15000 });
  await p.getByRole("button", { name: /Legenda/ }).first().click();
  await p.waitForTimeout(400);
  await p.evaluate(() => window.scrollTo(0, 0));
  const m2 = await medir();
  console.log("Sem legenda:", JSON.stringify(m2), "· texto da fala visível?", await p.locator(".texto-fala").count() ? "sim ❌" : "não ✅");
  await p.screenshot({ path: path.join(__dirname, "saida", "c2-compacto-sem-legenda.png") });
  await b.close();
})().catch((e) => { console.error("FALHOU:", e); process.exit(1); });
