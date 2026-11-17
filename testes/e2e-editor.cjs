// Teste do administrador: PIN, cadastrar, ocultar/publicar, editar, exportar, excluir e reimportar.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const { entrarAdmin, criarCenaTeste } = require("./auxiliar.cjs");
const BASE = process.argv[2] || "http://localhost:4173/";
const SAIDA = path.join(__dirname, "saida");
fs.mkdirSync(SAIDA, { recursive: true });

(async () => {
  const navegador = await chromium.launch();
  const ctx = await navegador.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const p = await ctx.newPage();
  const erros = [];
  p.on("pageerror", (e) => erros.push(String(e)));
  p.on("console", (m) => m.type() === "error" && erros.push(m.text()));
  p.on("response", (r) => r.status() >= 400 && erros.push(`${r.status()} ${r.request().method()} ${r.url()}`));

  // Sem login, as rotas de edição voltam para a tela de login.
  await p.goto(BASE + "#/admin/cena/nova");
  await p.getByRole("button", { name: "Entrar" }).waitFor();
  console.log("Rota de edição protegida: ok");
  await p.locator("#admin-email").fill("admin@teste.dev");
  await p.locator("#admin-senha").fill("senha-errada");
  await p.getByRole("button", { name: "Entrar" }).click();
  await p.getByText("E-mail ou senha incorretos.").waitFor();
  console.log("Senha errada recusada: ok");

  await entrarAdmin(p, BASE);
  await criarCenaTeste(p, "Teste do admin");
  await p.screenshot({ path: path.join(SAIDA, "9-admin.png") });

  // Ocultar: some da lista pública.
  await p.getByRole("button", { name: "Ocultar" }).click();
  await p.getByText("Oculta", { exact: true }).first().waitFor();
  await p.goto(BASE + "#/cenas");
  await p.getByText("Nenhuma cena disponível ainda.").waitFor();
  console.log("Cena oculta não aparece para usuários: ok");
  await p.goto(BASE + "#/admin");
  await p.getByRole("button", { name: "Publicar" }).click();
  await p.goto(BASE + "#/cenas");
  await p.getByText("Teste do admin").waitFor();
  console.log("Cena publicada aparece para usuários: ok");

  // Editar o título.
  await p.goto(BASE + "#/admin");
  await p.getByRole("link", { name: /Editar/ }).click();
  await p.getByLabel("Título").fill("Teste do admin (editado)");
  await p.getByRole("button", { name: /Salvar cena/ }).click();
  await p.getByText("Teste do admin (editado)").waitFor();
  console.log("Edição salva: ok");

  // Exportar, excluir e reimportar.
  const down = p.waitForEvent("download");
  await p.getByTitle("Baixar a cena como pacote .dubla").click();
  const d = await down;
  const pacote = path.join(SAIDA, d.suggestedFilename());
  await d.saveAs(pacote);
  console.log("Pacote exportado:", d.suggestedFilename(), fs.statSync(pacote).size, "bytes");
  await p.getByRole("button", { name: /Excluir/ }).click();
  await p.getByRole("button", { name: "Confirmar exclusão" }).click();
  await p.getByText("Nenhuma cena cadastrada.").waitFor();
  const [imp] = await Promise.all([p.waitForEvent("filechooser"), p.getByRole("button", { name: /Importar pacote/ }).click()]);
  await imp.setFiles(pacote);
  await p.getByRole("heading", { name: "Editar cena" }).waitFor();
  await p.getByRole("heading", { name: "Falas (6)" }).waitFor();
  console.log("Reimportado no editor com 6 falas: ok");

  // Sair.
  await p.goto(BASE + "#/admin");
  await p.getByRole("button", { name: /Sair/ }).click();
  await p.getByRole("button", { name: "Entrar" }).waitFor();
  console.log("Saída do administrador: ok");

  // Os arquivos substituídos/excluídos não ficam sobrando no servidor.
  const estado = await (await fetch("http://localhost:54399/__estado")).json();
  console.log("No servidor:", estado.cenas.length, "cena(s),", estado.arquivos.length, "arquivo(s):", estado.arquivos.join(", "));

  // A tentativa de senha errada (feita de propósito) gera um 400 esperado.
  const inesperados = erros.filter((e) => !e.includes("/auth/v1/token") && !e.includes("400 (Bad Request)"));
  console.log(inesperados.length ? "ERROS:\n" + inesperados.join("\n") : "Sem erros inesperados no console.");
  await navegador.close();
})().catch((e) => {
  console.error("FALHOU:", e);
  process.exit(1);
});
