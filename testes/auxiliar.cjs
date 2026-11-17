// Funções compartilhadas pelos testes de ponta a ponta.
const path = require("path");
const FIX = path.join(__dirname, "fixtures");
const PIN = "2468";

/** Entra na área do administrador (cria o PIN na primeira vez). */
async function entrarAdmin(p, base) {
  await p.goto(base + "#/admin");
  const criar = p.getByRole("button", { name: "Criar PIN e entrar" });
  const entrar = p.getByRole("button", { name: "Entrar" });
  await Promise.race([criar.waitFor(), entrar.waitFor(), p.getByRole("heading", { name: "Administração" }).waitFor()]);
  if (await criar.isVisible()) {
    await p.locator("#pin").fill(PIN);
    await p.locator("#pin-confirmacao").fill(PIN);
    await criar.click();
  } else if (await entrar.isVisible()) {
    await p.locator("#pin").fill(PIN);
    await entrar.click();
  }
  await p.getByRole("heading", { name: "Administração" }).waitFor();
}

/** Cria e publica a cena de teste (vídeo + fundo + legendas, Capivara e Tucano). */
async function criarCenaTeste(p, titulo = "Cadê meu chinelo?") {
  await p.getByRole("link", { name: /Adicionar vídeo/ }).first().click();
  await p.getByRole("heading", { name: "Adicionar vídeo" }).waitFor();
  const [v] = await Promise.all([p.waitForEvent("filechooser"), p.getByRole("button", { name: /Escolher o vídeo da cena/ }).click()]);
  await v.setFiles(path.join(FIX, "cena-teste", "video.mp4"));
  await p.locator(".palco video").waitFor();
  const [f] = await Promise.all([p.waitForEvent("filechooser"), p.locator("section", { hasText: "Arquivos" }).getByRole("button", { name: "Escolher" }).click()]);
  await f.setFiles(path.join(FIX, "cena-teste", "fundo.m4a"));
  await p.getByText("carregada").waitFor();
  const [s] = await Promise.all([p.waitForEvent("filechooser"), p.getByRole("button", { name: /Importar legendas/ }).click()]);
  await s.setFiles(path.join(FIX, "cena-teste.srt"));
  await p.getByRole("heading", { name: "Falas (6)" }).waitFor();
  await p.getByLabel("Título").fill(titulo);
  const nomes = p.getByLabel("Nome do personagem");
  await nomes.nth(0).fill("Capivara");
  await nomes.nth(1).fill("Tucano");
  for (const i of [1, 3, 5]) await p.getByLabel("Personagem", { exact: true }).nth(i).selectOption({ label: "Tucano" });
  await p.getByRole("button", { name: /Salvar cena/ }).click();
  await p.getByRole("heading", { name: "Administração" }).waitFor();
  await p.getByText(titulo).first().waitFor();
}

module.exports = { entrarAdmin, criarCenaTeste, PIN };
