// Teste "Arrumar falas com IA" (versão 3.7): uma fala que junta duas pessoas (como no vídeo do usuário) tem que ser
// dividida na pausa, cada pedaço com o personagem certo pelo tom de voz. Usa o diálogo de teste (duas vozes).
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const { entrarAdmin } = require("./auxiliar.cjs");
const BASE = process.argv[2] || "http://localhost:4174/";
const SAIDA = path.join(__dirname, "saida");
const SRT = path.join(SAIDA, "cena-fala-juntas.srt");

(async () => {
  // Fala 1 junta as duas primeiras falas do diálogo (pessoa 1 e pessoa 2); depois, uma de cada.
  fs.writeFileSync(SRT, [
    "1\n00:00:01,000 --> 00:00:07,300\nViu minhas sandálias em algum lugar? Sim, estão no telhado, como sempre.\n",
    "2\n00:00:08,500 --> 00:00:11,100\nNo telhado? Quem põe sandálias no telhado?\n",
    "3\n00:00:12,300 --> 00:00:15,100\nSua avó, para você ficar em casa.\n",
  ].join("\n"));
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
  const [s] = await Promise.all([p.waitForEvent("filechooser"), p.getByRole("button", { name: /Importar legendas/ }).click()]);
  await s.setFiles(SRT);
  await p.getByRole("heading", { name: "Falas (3)" }).waitFor();
  const nomes = p.getByLabel("Nome do personagem");
  await nomes.nth(0).fill("Ana");
  await nomes.nth(1).fill("Beto");
  await p.getByLabel("Personagem", { exact: true }).nth(2).selectOption({ label: "Beto" }); // fala 3 é da 2ª pessoa
  const t0 = Date.now();
  await p.getByRole("button", { name: /Arrumar falas com IA/ }).click();
  await p.getByText(/dividi 1 fala que juntava duas vozes/i).waitFor({ timeout: 600000 });
  const aviso = await p.locator(".cartao-ia .info").innerText();
  const linhas = await p.locator(".linha-fala").evaluateAll((els) =>
    els.map((el) => ({ personagem: el.querySelector("select").selectedOptions[0]?.textContent, texto: el.querySelector('[aria-label="Texto da fala"]').value, tempo: [...el.querySelectorAll(".ajuste-tempo button:nth-child(2)")].map((b) => b.textContent).join("→") })),
  );
  console.log(`Em ${((Date.now() - t0) / 1000).toFixed(0)} s: ${aviso}`);
  linhas.forEach((l, i) => console.log(`  ${i + 1}. [${l.tempo}] ${l.personagem}: "${l.texto}"`));
  const ok = linhas.length >= 4 && linhas[0].personagem === "Ana" && linhas[1].personagem === "Beto" && linhas[0].texto.includes("sandálias") && /telhado/.test(linhas[1].texto);
  console.log("A fala com duas pessoas virou duas, cada uma com seu personagem:", ok ? "ok" : "FALHOU");
  await p.locator("section", { hasText: "Falas (" }).screenshot({ path: path.join(SAIDA, "ia-arrumar.png") });
  console.log(erros.length ? "ERROS:\n" + erros.join("\n") : "Sem erros no console.");
  await navegador.close();
})().catch((e) => {
  console.error("FALHOU:", e);
  process.exit(1);
});
