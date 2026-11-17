// Teste da separação automática de falas: o administrador adiciona um vídeo com diálogo em inglês
// (duas vozes) e a IA deve criar as falas com tempos, texto em português e personagens alternados.
// Precisa de internet para baixar os modelos (Hugging Face) e o motor de IA (jsDelivr) na primeira vez.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const { entrarAdmin } = require("./auxiliar.cjs");
const BASE = process.argv[2] || "http://localhost:4174/";
const SAIDA = path.join(__dirname, "saida");
fs.mkdirSync(SAIDA, { recursive: true });

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
  const t0 = Date.now();
  await p.getByRole("button", { name: "✨ Separar falas" }).click();
  let ultimo = "";
  const relogio = setInterval(async () => {
    const t = await p.locator(".cartao-ia .pequeno").first().innerText().catch(() => "");
    if (t && t !== ultimo) console.log(`  [${((Date.now() - t0) / 1000).toFixed(0)} s] ${(ultimo = t)}`);
  }, 1500);
  await p.getByText(/Encontrei \d+ falas?/).waitFor({ timeout: 600000 });
  clearInterval(relogio);
  console.log(`Concluído em ${((Date.now() - t0) / 1000).toFixed(1)} s:`, await p.getByText(/Encontrei \d+ falas?/).innerText());

  const linhas = await p.locator(".linha-fala").evaluateAll((els) =>
    els.map((el) => ({
      personagem: el.querySelector("select").selectedOptions[0]?.textContent,
      texto: el.querySelector('input[aria-label="Texto da fala"]').value,
      original: el.querySelector('[title="Texto original"]')?.textContent?.replace("🌐 ", ""),
      tempos: [...el.querySelectorAll(".ajuste-tempo button:nth-child(2)")].map((b) => b.textContent).join(" → "),
    })),
  );
  linhas.forEach((l, i) => console.log(`  ${i + 1}. [${l.tempos}] ${l.personagem}: "${l.texto}"   (original: ${l.original})`));
  await p.locator("section", { hasText: "Falas (" }).screenshot({ path: path.join(SAIDA, "ia-falas.png") });
  const alterna = linhas.every((l, i) => i === 0 || l.personagem !== linhas[i - 1].personagem);
  console.log("Personagens alternando como no diálogo:", alterna ? "ok" : "NÃO");
  console.log(erros.length ? "ERROS:\n" + erros.join("\n") : "Sem erros no console.");
  await navegador.close();
})().catch((e) => {
  console.error("FALHOU:", e);
  process.exit(1);
});
