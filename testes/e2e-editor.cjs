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

  // Sem PIN, as rotas de edição voltam para a tela de PIN.
  await p.goto(BASE + "#/admin/cena/nova");
  await p.getByRole("button", { name: "Criar PIN e entrar" }).waitFor();
  console.log("Rota de edição protegida: ok");

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

  // Sair do modo administrador.
  await p.goto(BASE + "#/admin");
  await p.getByRole("button", { name: /Sair do modo administrador/ }).click();
  await p.getByRole("button", { name: "Entrar" }).waitFor();
  await p.locator("#pin").fill("0000");
  await p.getByRole("button", { name: "Entrar" }).click();
  await p.getByText("PIN incorreto.").waitFor();
  console.log("PIN errado recusado: ok");

  console.log(erros.length ? "ERROS:\n" + erros.join("\n") : "Sem erros no console.");
  await navegador.close();
})().catch((e) => {
  console.error("FALHOU:", e);
  process.exit(1);
});
