// Estúdio no celular (versão 5.2): vídeo, legenda, onda e botões (Original / Gravar / Minha tomada) cabem numa
// tela só, sem rolar, em celulares de vários tamanhos.
const { chromium, devices } = require("playwright");
const path = require("path");
const { entrarAdmin, criarCenaTeste } = require("./auxiliar.cjs");
const BASE = process.argv[2] || "http://localhost:4174/";
const S = "http://localhost:54399";
(async () => {
  const nav = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
  const adm = await (await nav.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await entrarAdmin(adm, BASE);
  await criarCenaTeste(adm, "Uma tela só");
  const cena = (await (await fetch(`${S}/__estado`)).json()).cenas[0];
  const erros = [];
  let tudoOk = true;
  for (const [nome, opc] of [
    ["Celular pequeno 360×640", { viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
    ["Celular comum 360×780 (como o seu)", { viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
    ["Pixel 7", devices["Pixel 7"]],
    ["iPhone 13", devices["iPhone 13"]],
  ]) {
    const pg = await (await nav.newContext({ ...opc, permissions: ["microphone"] })).newPage();
    pg.on("pageerror", (e) => erros.push(String(e)));
    await pg.goto(BASE + "#/cena/" + cena.id);
    await pg.getByRole("button", { name: /Entrar no estúdio/ }).click();
    await pg.locator(".estudio").waitFor();
    await pg.waitForFunction(() => document.querySelector(".estudio video")?.readyState >= 2);
    await pg.waitForTimeout(600);
    const r = await pg.evaluate(() => {
      const caixa = (sel) => document.querySelector(sel)?.getBoundingClientRect();
      const video = caixa(".estudio .palco"), fala = caixa(".cartao-fala .texto-fala"), onda = caixa(".painel-onda"), gravar = caixa(".botao-gravar-grande"), original = caixa(".botoes-redondos .botao-redondo");
      const h = innerHeight;
      const visivel = (b) => !!b && b.top >= 0 && b.bottom <= h + 1;
      return { h, video: visivel(video), fala: visivel(fala), onda: visivel(onda), gravar: visivel(gravar), original: visivel(original), rolagem: scrollY };
    });
    const ok = r.video && r.fala && r.onda && r.gravar && r.original;
    tudoOk = tudoOk && ok;
    console.log(`${nome}: vídeo ${r.video ? "✓" : "✗"} · legenda ${r.fala ? "✓" : "✗"} · onda ${r.onda ? "✓" : "✗"} · botões ${r.gravar && r.original ? "✓" : "✗"}`);
    await pg.screenshot({ path: path.join(__dirname, "saida", `uma-tela-${opc.viewport?.width ?? "x"}x${opc.viewport?.height ?? "y"}.png`) });
    await pg.context().close();
  }
  console.log("Estúdio inteiro numa tela só (sem rolar) nos celulares:", tudoOk ? "ok" : "FALHOU");
  console.log(erros.length ? "ERROS:\n" + erros.join("\n") : "Sem erros no console.");
  await nav.close();
})().catch((e) => { console.error("FALHOU:", e); process.exit(1); });
