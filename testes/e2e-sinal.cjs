// Teste do sinal de fala no estúdio (versão 3.0): ao gravar, o aviso passa por Prepare-se → FALE AGORA → PARE,
// e a onda mostra as marcas FALE (verde) e PARE (vermelho).
const { chromium, devices } = require("playwright");
const path = require("path");
const { entrarAdmin, criarCenaTeste } = require("./auxiliar.cjs");
const BASE = process.argv[2] || "http://localhost:4174/";
const SERVIDOR = "http://localhost:54399";
const SAIDA = path.join(__dirname, "saida");

(async () => {
  const navegador = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
  const erros = [];
  const nova = async (o) => {
    const pg = await (await navegador.newContext({ ...o, permissions: ["microphone"] })).newPage();
    pg.on("pageerror", (e) => erros.push(String(e)));
    pg.on("console", (m) => m.type() === "error" && !/status of 4\d\d/.test(m.text()) && erros.push(m.text()));
    return pg;
  };
  const adm = await nova({ viewport: { width: 1280, height: 900 } });
  await entrarAdmin(adm, BASE);
  await criarCenaTeste(adm, "Cena do sinal");
  const cenaId = (await (await fetch(`${SERVIDOR}/__estado`)).json()).cenas.find((c) => c.titulo === "Cena do sinal").id;

  const u = await nova({ ...devices["Pixel 7"] });
  await u.goto(BASE + "#/cena/" + cenaId);
  await u.getByRole("button", { name: /Entrar no estúdio/ }).click();
  await u.locator(".estudio").waitFor();
  await u.waitForFunction(() => document.querySelector("video")?.readyState >= 2);
  await u.locator(".sinal-fala.parado").getByText("Comece").waitFor();
  console.log("Parado: dica \"Comece no traço verde e pare no vermelho\": ok");
  // Observa os estados do sinal durante a gravação da fala 1 (1,0 s a 3,2 s).
  await u.evaluate(() => {
    window.__sinais = [];
    const ver = () => {
      const el = document.querySelector(".sinal-fala");
      const c = el ? [...el.classList].find((x) => x !== "sinal-fala") : null;
      if (c && window.__sinais[window.__sinais.length - 1] !== c) window.__sinais.push(c);
      requestAnimationFrame(ver);
    };
    ver();
  });
  await u.getByRole("button", { name: /Gravar esta fala/ }).click();
  await u.locator(".sinal-fala.fale").waitFor({ timeout: 10000 });
  await u.waitForTimeout(500);
  await u.screenshot({ path: path.join(SAIDA, "s1-fale-agora.png") });
  await u.locator(".sinal-fala.pare").waitFor({ timeout: 10000 });
  await u.locator(".sinal-fala.parado").waitFor({ timeout: 10000 });
  const sinais = await u.evaluate(() => window.__sinais);
  const ordem = sinais.filter((x) => x !== "parado").join(" → ");
  console.log(`Sinal durante a gravação: ${ordem}`, ordem === "prepare → fale → pare" ? "ok" : "FALHOU");
  await u.screenshot({ path: path.join(SAIDA, "s2-onda-marcas.png") });
  console.log(erros.length ? "ERROS:\n" + erros.join("\n") : "Sem erros no console.");
  await navegador.close();
})().catch((e) => {
  console.error("FALHOU:", e);
  process.exit(1);
});
