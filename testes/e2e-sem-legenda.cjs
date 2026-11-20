// Dublagem de ouvido (versão 5.3): sem legenda no estúdio e no resultado. No lugar, "Ouça … e fale do seu jeito"
// e, com o vídeo tocando, a contagem até a próxima fala ("🗣️ Tucano fala em 2" / "🎙️ Sua vez em 1").
const { chromium, devices } = require("playwright");
const path = require("path");
const { entrarAdmin, criarCenaTeste } = require("./auxiliar.cjs");
const BASE = process.argv[2] || "http://localhost:4174/";
const S = "http://localhost:54399";
(async () => {
  const nav = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
  const adm = await (await nav.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await entrarAdmin(adm, BASE);
  await criarCenaTeste(adm, "Sem legenda");
  const cena = (await (await fetch(`${S}/__estado`)).json()).cenas[0];
  const textos = cena.falas.map((f) => f.texto);
  const u = await (await nav.newContext({ ...devices["Pixel 7"], permissions: ["microphone"] })).newPage();
  const erros = [];
  u.on("pageerror", (e) => erros.push(String(e)));
  await u.goto(BASE + "#/cena/" + cena.id);
  await u.getByRole("button", { name: /^Tucano/ }).click(); // dubla só a Capivara
  await u.getByRole("button", { name: /Entrar no estúdio/ }).click();
  await u.locator(".estudio").waitFor();
  await u.getByText(/Ouça Capivara e fale do seu jeito/).waitFor();
  const mostra = async () => { const corpo = await u.locator("body").innerText(); return textos.filter((t) => t && corpo.includes(t)); };
  let vistos = await mostra();
  console.log("Estúdio: “Ouça Capivara e fale do seu jeito” e nenhuma legenda:", vistos.length === 0 ? "ok" : `FALHOU (${vistos.join(" | ")})`);
  // Toca o vídeo desde o começo: antes de cada fala aparece a contagem.
  const vistosContagem = new Set();
  await u.evaluate(() => { const v = document.querySelector(".estudio video"); v.currentTime = 0; v.muted = true; return v.play(); });
  for (let i = 0; i < 40; i++) {
    const t = await u.locator(".proxima-fala").innerText().catch(() => "");
    if (t) vistosContagem.add(t.replace(/\s+/g, " ").replace(/\d+$/, "N"));
    await u.waitForTimeout(200);
  }
  await u.screenshot({ path: path.join(__dirname, "saida", "sem-legenda-contagem.png") });
  const lista = [...vistosContagem];
  console.log(`Contagem antes das falas (${lista.join(" · ")}):`, lista.some((x) => /Sua vez em/.test(x)) && lista.some((x) => /Tucano fala em/.test(x)) ? "ok" : "FALHOU");
  await u.evaluate(() => document.querySelector(".estudio video").pause());
  // Resultado: sem legenda também.
  await u.getByRole("link", { name: /Resultado/ }).click();
  await u.locator(".palco video").waitFor();
  await u.waitForTimeout(800);
  vistos = await mostra();
  console.log("Resultado sem legenda:", vistos.length === 0 && (await u.getByRole("button", { name: /Legenda/ }).count()) === 0 ? "ok" : `FALHOU (${vistos.join(" | ")})`);
  console.log(erros.length ? "ERROS:\n" + erros.join("\n") : "Sem erros no console.");
  await nav.close();
})().catch((e) => { console.error("FALHOU:", e); process.exit(1); });
