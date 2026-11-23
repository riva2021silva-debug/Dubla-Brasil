// Funções compartilhadas pelos testes de ponta a ponta.
const path = require("path");
const FIX = path.join(__dirname, "fixtures");
// Mesmo login do servidor simulado (testes/servidor-falso.cjs).
const ADMIN = { email: "admin@teste.dev", senha: "senha-de-teste-123" };

/** Entra na área do administrador com e-mail e senha. */
async function entrarAdmin(p, base, { iaAutomatica = false } = {}) {
  await p.goto(base + "#/admin");
  // A fila automática (versão 5.7) só roda a IA de 180 MB nos testes que pedem.
  await p.evaluate((sim) => (sim ? localStorage.removeItem("dubla-brasil:teste-sem-ia") : localStorage.setItem("dubla-brasil:teste-sem-ia", "1")), iaAutomatica);
  const titulo = p.getByRole("heading", { name: "Administração" });
  const botao = p.getByRole("button", { name: "Entrar" });
  await Promise.race([titulo.waitFor(), botao.waitFor()]);
  if (await botao.isVisible()) {
    await p.locator("#admin-email").fill(ADMIN.email);
    await p.locator("#admin-senha").fill(ADMIN.senha);
    await botao.click();
  }
  await titulo.waitFor();
}

/** Depois de "Salvar": espera a fila automática terminar de enviar (versão 5.7, o envio é em segundo plano). */
async function esperarFila(p, timeout = 300000) {
  await p.waitForFunction(() => !document.querySelector("#processamento li.andando"), null, { timeout, polling: 250 });
  const erro = await p.locator("#processamento li.erro").first().innerText().catch(() => null);
  if (erro) throw new Error("A fila não conseguiu salvar: " + erro);
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
  await esperarFila(p);
  await p.getByText(titulo).first().waitFor();
}

module.exports = { esperarFila, entrarAdmin, criarCenaTeste, ADMIN };
