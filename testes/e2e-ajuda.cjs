// Teste da Ajuda (versão 2.9): a pessoa manda uma mensagem, o administrador vê (com aviso no botão Admin),
// responde e resolve; a pessoa vê a resposta. Confere também a lista de avisos da Cakto no admin.
const { chromium, devices } = require("playwright");
const path = require("path");
const { entrarAdmin } = require("./auxiliar.cjs");
const BASE = process.argv[2] || "http://localhost:4174/";
const SAIDA = path.join(__dirname, "saida");

(async () => {
  const navegador = await chromium.launch();
  const erros = [];
  const nova = async (o) => {
    const pg = await (await navegador.newContext(o)).newPage();
    pg.on("pageerror", (e) => erros.push(String(e)));
    pg.on("console", (m) => m.type() === "error" && !/status of 4\d\d/.test(m.text()) && erros.push(m.text()));
    return pg;
  };
  const u = await nova({ ...devices["Pixel 7"] });
  await u.goto(BASE + "#/cenas");
  await u.getByRole("link", { name: "Ajuda" }).click();
  await u.getByRole("heading", { name: "Ajuda" }).waitFor();
  await u.getByRole("radio", { name: /Algo não funciona/ }).click();
  await u.locator("#texto-ajuda").fill("No estúdio, quando aperto para gravar, o vídeo trava no começo.");
  await u.locator("#contato-ajuda").fill("whats 11 99999-0000");
  await u.getByRole("button", { name: /Enviar mensagem/ }).click();
  await u.getByText("Mensagem enviada!").waitFor();
  await u.getByRole("heading", { name: "Minhas mensagens" }).waitFor();
  await u.getByText("Enviada", { exact: true }).waitFor();
  await u.screenshot({ path: path.join(SAIDA, "h1-ajuda.png") });
  console.log("Usuário manda mensagem pela Ajuda (❓ no topo): ok");

  const adm = await nova({ ...devices["Pixel 7"] });
  await entrarAdmin(adm, BASE);
  await adm.getByRole("link", { name: "Admin, 1 mensagens novas" }).waitFor({ timeout: 10000 });
  console.log("Botão Admin mostra 1 mensagem nova: ok");
  await adm.getByRole("tab", { name: /Mensagens/ }).click();
  await adm.getByText("o vídeo trava no começo").waitFor();
  await adm.getByText(/versão \d+\.\d+/).first().waitFor();
  await adm.getByText("whats 11 99999-0000").waitFor();
  await adm.screenshot({ path: path.join(SAIDA, "h2-admin-mensagens.png") });
  await adm.getByLabel("Resposta").fill("Obrigado! Corrigimos na próxima versão. Atualize pelo aviso quando chegar.");
  await adm.getByRole("button", { name: /Responder e resolver/ }).click();
  await adm.getByText("Nenhuma mensagem esperando resposta").waitFor();
  await adm.getByRole("link", { name: "Admin", exact: true }).waitFor();
  console.log("Admin responde e resolve; o aviso do botão some: ok");
  await adm.getByRole("tab", { name: /Assinantes/ }).click();
  await adm.getByText("💳 Avisos da Cakto").waitFor();
  await adm.getByText("Nenhum aviso recebido ainda.").waitFor();
  console.log("Aba Assinantes mostra os avisos da Cakto: ok");

  await u.reload();
  await u.getByText("Resposta do Dubla Brasil:").waitFor();
  await u.getByText("Corrigimos na próxima versão").waitFor();
  await u.getByText("Resolvida", { exact: true }).waitFor();
  await u.screenshot({ path: path.join(SAIDA, "h3-resposta.png") });
  console.log("Usuário vê a resposta em Minhas mensagens: ok");
  console.log(erros.length ? "ERROS:\n" + erros.join("\n") : "Sem erros no console.");
  await navegador.close();
})().catch((e) => {
  console.error("FALHOU:", e);
  process.exit(1);
});
