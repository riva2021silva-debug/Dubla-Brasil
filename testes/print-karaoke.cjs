// Gera prints do estúdio no celular durante a gravação (legenda karaokê).
const { chromium, devices } = require("playwright");
const path = require("path");
const { entrarAdmin, criarCenaTeste } = require("./auxiliar.cjs");
const BASE = process.argv[2] || "http://localhost:4174/";
(async () => {
  const b = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
  const adm = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await entrarAdmin(adm, BASE);
  await criarCenaTeste(adm);
  const id = (await (await fetch("http://localhost:54399/__estado")).json()).cenas[0].id;
  const p = await (await b.newContext({ ...devices["Pixel 7"], permissions: ["microphone"] })).newPage();
  await p.goto(BASE + "#/cena/" + id);
  await p.getByRole("button", { name: /^Tucano/ }).click();
  await p.getByRole("button", { name: /Entrar no estúdio/ }).click();
  await p.waitForFunction(() => document.querySelector("video")?.readyState >= 2);
  await p.getByRole("button", { name: "Gravar esta fala" }).click();
  await p.locator(".legenda-karaoke.em-breve").waitFor({ timeout: 8000 });
  await p.screenshot({ path: path.join(__dirname, "saida", "k1-antes-da-fala.png") });
  await p.waitForFunction(() => document.querySelector(".legenda-karaoke.minha:not(.em-breve)"), null, { timeout: 8000 });
  await p.waitForTimeout(1100);
  await p.screenshot({ path: path.join(__dirname, "saida", "k2-durante-a-fala.png") });
  console.log("prints ok");
  await b.close();
})().catch((e) => { console.error("FALHOU:", e); process.exit(1); });
