// Teste do editor: cria uma cena com vídeo + fundo + .srt, salva, exporta e reimporta o pacote.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const BASE = process.argv[2] || "http://localhost:4173/";
const SAIDA = path.join(__dirname, "saida");
const MIDIA = path.join(__dirname, "..", "public", "exemplos", "capivara-tucano");

(async () => {
  const navegador = await chromium.launch();
  const ctx = await navegador.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const p = await ctx.newPage();
  const erros = [];
  p.on("pageerror", (e) => erros.push(String(e)));
  p.on("console", (m) => m.type() === "error" && erros.push(m.text()));
  p.on("dialog", (d) => { erros.push("diálogo inesperado: " + d.message()); d.dismiss(); });

  await p.goto(BASE + "#/editor");
  await p.getByRole("heading", { name: "Criar cena" }).waitFor();
  await p.getByRole("button", { name: /Salvar cena/ }).click();
  await p.getByText("Escolha o vídeo da cena.").waitFor();

  const [v] = await Promise.all([p.waitForEvent("filechooser"), p.getByRole("button", { name: /Escolher o vídeo da cena/ }).click()]);
  await v.setFiles(path.join(MIDIA, "video.mp4"));
  await p.locator(".palco video").waitFor();
  const [f] = await Promise.all([p.waitForEvent("filechooser"), p.locator("section", { hasText: "Arquivos" }).getByRole("button", { name: "Escolher" }).click()]);
  await f.setFiles(path.join(MIDIA, "fundo.m4a"));
  await p.getByText("carregada").waitFor();
  const [s] = await Promise.all([p.waitForEvent("filechooser"), p.getByRole("button", { name: /Importar legendas/ }).click()]);
  await s.setFiles(path.join(__dirname, "legendas-exemplo.srt"));
  await p.getByRole("heading", { name: "Falas (2)" }).waitFor();

  await p.getByLabel("Título").fill("Teste do editor");
  const nomes = p.getByLabel("Nome do personagem");
  await nomes.nth(0).fill("Capivara");
  await nomes.nth(1).fill("Tucano");
  await p.getByLabel("Personagem").nth(1).selectOption({ label: "Tucano" });
  await p.screenshot({ path: path.join(SAIDA, "9-editor.png") });
  await p.getByRole("button", { name: /Salvar cena/ }).click();
  await p.getByRole("heading", { name: "Teste do editor" }).waitFor();
  await p.getByText("Quem você vai dublar?").waitFor();
  console.log("Cena salva e aberta.");

  const down = p.waitForEvent("download");
  await p.getByRole("button", { name: /Exportar pacote/ }).click();
  const d = await down;
  const pacote = path.join(SAIDA, d.suggestedFilename());
  await d.saveAs(pacote);
  console.log("Pacote exportado:", d.suggestedFilename(), fs.statSync(pacote).size, "bytes");

  p.removeAllListeners("dialog");
  p.on("dialog", (dlg) => dlg.accept());
  await p.getByRole("button", { name: "Excluir cena" }).click();
  await p.getByRole("heading", { name: "Cenas" }).waitFor();

  const [imp] = await Promise.all([p.waitForEvent("filechooser"), p.getByRole("button", { name: /Importar pacote/ }).click()]);
  await imp.setFiles(pacote);
  await p.getByRole("heading", { name: "Teste do editor" }).waitFor();
  await p.waitForFunction(() => document.querySelector("video")?.readyState >= 1);
  const falas = await p.getByText(/^\d+ falas$/).allInnerTexts();
  console.log("Reimportado com sucesso; falas por papel:", falas.join(", "));

  console.log(erros.length ? "ERROS:\n" + erros.join("\n") : "Sem erros no console.");
  await navegador.close();
})().catch((e) => { console.error("FALHOU:", e); process.exit(1); });
