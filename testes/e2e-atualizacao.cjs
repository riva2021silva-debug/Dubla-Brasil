// Teste do aviso de atualização (versão 2.8): finge que o site publicou a 2.9 e confere o aviso,
// o "Depois", o "Procurar atualização" e as novidades depois de atualizar.
const { chromium, devices } = require("playwright");
const path = require("path");
const BASE = process.argv[2] || "http://localhost:4174/";
const SAIDA = path.join(__dirname, "saida");
const local = require("../public/versao.json");

(async () => {
  const navegador = await chromium.launch();
  const erros = [];
  const nova = async (versaoNoSite) => {
    const ctx = await navegador.newContext({ ...devices["Pixel 7"] });
    if (versaoNoSite)
      await ctx.route("**/versao.json*", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(versaoNoSite) }));
    const pg = await ctx.newPage();
    pg.on("pageerror", (e) => erros.push(String(e)));
    pg.on("console", (m) => m.type() === "error" && !/status of 4\d\d|Failed to load resource/.test(m.text()) && erros.push(m.text()));
    return pg;
  };
  const v29 = { versao: "2.9", codigo: local.codigo + 1, novidades: ["Novo filtro de voz", "Galeria mais rápida"], apk: "https://exemplo.invalid/app.apk" };

  // 1) Saiu a 2.9: o aviso aparece com as novidades.
  const a = await nova(v29);
  await a.goto(BASE + "#/cenas");
  await a.getByRole("heading", { name: "🎉 Atualização 2.9 disponível" }).waitFor({ timeout: 10000 });
  await a.getByText("Novo filtro de voz").waitFor();
  await a.getByText(`Você está na versão ${local.versao}`).waitFor();
  await a.screenshot({ path: path.join(SAIDA, "a1-aviso-atualizacao.png") });
  console.log(`Aviso "Atualização 2.9 disponível" com as novidades (app na ${local.versao}): ok`);
  await a.getByRole("button", { name: "Depois" }).click();
  await a.reload();
  await a.waitForTimeout(2500);
  const insistiu = await a.getByRole("heading", { name: /Atualização 2.9/ }).count();
  console.log("\"Depois\" não insiste na mesma versão ao reabrir:", insistiu ? "FALHOU" : "ok");
  // "Atualizar agora" no site recarrega a página.
  await a.goto(BASE + "#/configuracoes");
  await a.getByRole("button", { name: /Procurar atualização/ }).click();
  await a.getByRole("heading", { name: /Atualização 2.9/ }).waitFor();
  await Promise.all([a.waitForURL(/[?&]v=\d+/), a.getByRole("button", { name: /Atualizar agora/ }).click()]);
  console.log("\"Atualizar agora\" recarrega o site na versão nova: ok");

  // 2) Sem versão nova: "Procurar atualização" diz que está em dia.
  const b = await nova(null);
  await b.goto(BASE + "#/configuracoes");
  await b.getByText(`versão ${local.versao}`).waitFor();
  await b.waitForTimeout(1500);
  const avisoSemMotivo = await b.getByRole("heading", { name: /disponível/ }).count();
  await b.getByRole("button", { name: /Procurar atualização/ }).click();
  await b.getByRole("heading", { name: "✅ Você está na versão mais nova" }).waitFor();
  console.log("Sem versão nova: nenhum aviso e \"Procurar atualização\" diz que está em dia:", avisoSemMotivo ? "FALHOU" : "ok");

  // 3) Quem acabou de atualizar vê as novidades uma vez.
  const c = await nova(null);
  await c.goto(BASE + "#/cenas");
  await c.evaluate((cod) => localStorage.setItem("dubla-brasil:novidades-vistas", String(cod - 1)), local.codigo);
  await c.reload();
  await c.getByRole("heading", { name: `✨ Novidades da versão ${local.versao}` }).waitFor();
  await c.screenshot({ path: path.join(SAIDA, "a2-novidades.png") });
  await c.getByRole("button", { name: "Legal!" }).click();
  await c.reload();
  await c.waitForTimeout(1500);
  const deNovo = await c.getByRole("heading", { name: /Novidades da versão/ }).count();
  console.log("Novidades aparecem uma vez depois de atualizar:", deNovo ? "FALHOU" : "ok");

  console.log(erros.length ? "ERROS:\n" + erros.join("\n") : "Sem erros no console.");
  await navegador.close();
})().catch((e) => {
  console.error("FALHOU:", e);
  process.exit(1);
});
