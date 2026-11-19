// Estúdio (versão 4.3): "Fala 1 de 3 ▾" abre a lista das suas falas; tocar numa fala vai direto para ela.
const { chromium, devices } = require("playwright");
const path = require("path");
const { entrarAdmin, criarCenaTeste } = require("./auxiliar.cjs");
const BASE = process.argv[2] || "http://localhost:4174/";
const SERVIDOR = "http://localhost:54399";
(async () => {
  const nav = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
  const adm = await (await nav.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await entrarAdmin(adm, BASE);
  await criarCenaTeste(adm, "Lista de falas");
  const cena = (await (await fetch(`${SERVIDOR}/__estado`)).json()).cenas[0];
  const pg = await (await nav.newContext({ ...devices["Pixel 7"], permissions: ["microphone"] })).newPage();
  const erros = [];
  pg.on("pageerror", (e) => erros.push(String(e)));
  await pg.goto(BASE + "#/cena/" + cena.id);
  await pg.getByRole("button", { name: /Entrar no estúdio/ }).click();
  await pg.locator(".estudio").waitFor();
  await pg.getByRole("button", { name: /Fala 1 de 6\. Ver todas as falas/ }).click();
  await pg.getByRole("dialog", { name: "Suas falas" }).waitFor();
  const itens = await pg.locator(".item-fala").count();
  await pg.screenshot({ path: path.join(__dirname, "saida", "lista-falas.png") });
  await pg.locator(".item-fala").nth(4).click();
  await pg.getByRole("button", { name: /Fala 5 de 6/ }).waitFor();
  console.log("Lista com as 6 falas e pulo direto para a 5ª:", itens === 6 ? "ok" : `FALHOU (${itens})`);
  console.log("Atalho do microfone no estúdio:", (await pg.getByRole("link", { name: "Ajustar o microfone" }).count()) === 1 ? "ok" : "FALHOU");
  console.log(erros.length ? "ERROS:\n" + erros.join("\n") : "Sem erros no console.");
  await nav.close();
})().catch((e) => { console.error("FALHOU:", e); process.exit(1); });
