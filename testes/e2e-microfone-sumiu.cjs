// Microfone que sumiu (versão 5.6): a pessoa tinha escolhido um microfone de lapela e desconectou. O app não pode
// dizer "Nenhum microfone encontrado": volta sozinho para o microfone do celular e esquece o antigo.
const { chromium, devices } = require("playwright");
const { entrarAdmin, criarCenaTeste } = require("./auxiliar.cjs");
const BASE = process.argv[2] || "http://localhost:4174/";
const S = "http://localhost:54399";
(async () => {
  const nav = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
  const adm = await (await nav.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await entrarAdmin(adm, BASE);
  await criarCenaTeste(adm, "Microfone sumiu");
  const cena = (await (await fetch(`${S}/__estado`)).json()).cenas[0];
  const ctx = await nav.newContext({ ...devices["Pixel 7"], permissions: ["microphone"] });
  await ctx.addInitScript(() => {
    if (!sessionStorage.getItem("ja")) {
      sessionStorage.setItem("ja", "1");
      localStorage.setItem("dubla-brasil:config", JSON.stringify({ microfoneId: "microfone-de-lapela-que-foi-desconectado", versao: 2 }));
    }
  });
  const u = await ctx.newPage();
  await u.goto(BASE + "#/cena/" + cena.id);
  await u.getByRole("button", { name: "Ligar o microfone" }).click();
  await u.waitForTimeout(2500);
  const erro = await u.getByText("Nenhum microfone encontrado").count();
  const cfg = await u.evaluate(() => JSON.parse(localStorage.getItem("dubla-brasil:config") || "{}"));
  console.log("Teste do microfone volta para o do celular (sem erro):", erro === 0 ? "ok" : "FALHOU");
  console.log("Esqueceu o microfone desconectado:", cfg.microfoneId === "" ? "ok" : `FALHOU (${cfg.microfoneId})`);
  await u.getByRole("button", { name: /Entrar no estúdio/ }).click();
  await u.locator(".estudio").waitFor();
  await u.waitForFunction(() => document.querySelector(".estudio video")?.readyState >= 2);
  await u.getByRole("button", { name: "Gravar esta fala" }).click();
  await u.getByRole("link", { name: /Resultado 1\// }).waitFor({ timeout: 30000 });
  console.log("Grava no estúdio normalmente: ok");
  await nav.close();
})().catch((e) => { console.error("FALHOU:", e); process.exit(1); });
