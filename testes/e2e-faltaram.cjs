// Teste "Encontrar falas que faltaram" (versão 3.6): depois de separar as falas com a IA, uma fala é apagada de
// propósito; o botão tem que achá-la de novo (pelo detector de voz) com o texto e um personagem.
// Precisa de internet para os modelos (Hugging Face) na primeira vez.
const { chromium } = require("playwright");
const path = require("path");
const { entrarAdmin } = require("./auxiliar.cjs");
const BASE = process.argv[2] || "http://localhost:4174/";
const SAIDA = path.join(__dirname, "saida");

(async () => {
  const navegador = await chromium.launch();
  const p = await (await navegador.newContext({ viewport: { width: 1280, height: 1000 } })).newPage();
  const erros = [];
  p.on("pageerror", (e) => erros.push(String(e)));
  p.on("console", (m) => m.type() === "error" && erros.push(m.text()));
  await entrarAdmin(p, BASE);
  await p.getByRole("link", { name: /Adicionar vídeo/ }).first().click();
  const [v] = await Promise.all([p.waitForEvent("filechooser"), p.getByRole("button", { name: /Escolher o vídeo da cena/ }).click()]);
  await v.setFiles(path.join(__dirname, "fixtures", "cena-fala", "video.mp4"));
  await p.locator(".palco video").waitFor();
  await p.getByLabel("Idioma das falas").selectOption("Inglês");
  await p.getByRole("button", { name: "✨ Separar falas" }).click();
  await p.getByText(/Encontrei \d+ falas?/).waitFor({ timeout: 600000 });
  const falas = async () => p.locator(".linha-fala").evaluateAll((els) => els.map((el) => ({ texto: el.querySelector('[aria-label="Texto da fala"]').value, tempo: el.querySelector(".ajuste-tempo button:nth-child(2)")?.textContent })));
  const antes = await falas();
  console.log(`A IA separou ${antes.length} falas:`, antes.map((f) => `${f.tempo} "${f.texto}"`).join(" | "));

  // Já de cara, a IA não deixa buraco: procurar de novo não acha nada.
  await p.getByRole("button", { name: /Encontrar falas que faltaram/ }).click();
  await p.getByText(/Não encontrei trechos falados sem fala marcada|Encontrei \d+ falas? que falta/).waitFor({ timeout: 600000 });
  const primeira = await p.locator(".cartao-ia .info").innerText();
  console.log("Procurando logo depois de separar:", primeira.startsWith("✅") ? "nenhum buraco (ok)" : primeira);

  // Apaga a 2ª fala de propósito.
  const apagada = (await falas())[1];
  await p.locator(".linha-fala").nth(1).getByRole("button", { name: "Excluir fala" }).click();
  console.log(`Apaguei a fala ${apagada.tempo} "${apagada.texto}"`);
  const t0 = Date.now();
  await p.getByRole("button", { name: /Encontrar falas que faltaram/ }).click();
  await p.getByText(/Encontrei \d+ falas? que falta/).waitFor({ timeout: 600000 });
  const aviso = await p.locator(".cartao-ia .info").innerText();
  const depois = await falas();
  const voltou = depois.find((f) => f.tempo === apagada.tempo || Math.abs(parseFloat(f.tempo.replace(":", ".").replace(",", ".")) - parseFloat(apagada.tempo.replace(":", ".").replace(",", "."))) < 0.01 + 0.5);
  console.log(`Em ${((Date.now() - t0) / 1000).toFixed(0)} s: ${aviso}`);
  console.log(`Falas: ${antes.length} → ${antes.length - 1} (apagada) → ${depois.length}`);
  const achou = depois.length === antes.length && depois.some((f, i) => i === 1 && f.texto && f.texto !== "…");
  console.log("A fala apagada foi encontrada de novo, com texto:", achou ? `ok ("${depois[1].texto}")` : "FALHOU");
  await p.locator("section", { hasText: "Falas (" }).screenshot({ path: path.join(SAIDA, "ia-faltaram.png") });
  console.log(erros.length ? "ERROS:\n" + erros.join("\n") : "Sem erros no console.");
  await navegador.close();
})().catch((e) => {
  console.error("FALHOU:", e);
  process.exit(1);
});
