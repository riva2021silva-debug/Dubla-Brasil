// Teste de ponta a ponta: escolhe a cena de exemplo, grava com microfone simulado, assiste e baixa o vídeo.
// Uso: node testes/e2e.cjs [url]   (com `npx vite preview --port 4173` rodando)
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const BASE = process.argv[2] || "http://localhost:4173/";
const SAIDA = path.join(__dirname, "saida");
const { entrarAdmin, criarCenaTeste } = require("./auxiliar.cjs");
fs.mkdirSync(SAIDA, { recursive: true });

(async () => {
  const navegador = await chromium.launch({
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
  });
  const ctx = await navegador.newContext({ viewport: { width: 1280, height: 860 }, acceptDownloads: true, permissions: ["microphone"] });
  const p = await ctx.newPage();
  const erros = [];
  p.on("pageerror", (e) => erros.push(String(e)));
  p.on("console", (m) => m.type() === "error" && erros.push(m.text()));
  const foto = (n) => p.screenshot({ path: path.join(SAIDA, n + ".png") });

  await p.goto(BASE);
  await p.getByRole("heading", { name: /Sua voz no lugar/ }).waitFor();
  await p.getByText("Nenhuma cena disponível ainda.").waitFor();
  await foto("0-inicio-vazio");

  // O administrador cadastra e publica a cena.
  await entrarAdmin(p, BASE);
  await criarCenaTeste(p);
  await foto("0b-admin");
  await p.goto(BASE);
  await p.getByRole("heading", { name: /Sua voz no lugar/ }).waitFor();
  await p.locator(".cartao-cena img").first().waitFor();
  await foto("1-inicio");

  await p.getByRole("link", { name: /Escolher uma cena/ }).click();
  await p.getByText("Cadê meu chinelo?").first().click();
  // Começa com todos escolhidos; tira o Tucano para dublar só a Capivara.
  await p.getByRole("button", { name: /^Tucano/ }).click();
  await p.getByText("Você dubla: Capivara").waitFor();
  await foto("2-papel");
  await p.getByRole("button", { name: /Entrar no estúdio/ }).click();
  await p.locator(".estudio").waitFor();
  await p.waitForFunction(() => document.querySelector("video")?.readyState >= 2);
  await foto("3-estudio");

  // Grava uma fala sozinha e confere a contagem.
  await p.getByRole("button", { name: "Gravar esta fala" }).click();
  await p.locator(".contagem").waitFor({ timeout: 8000 });
  await foto("4-contagem");
  await p.waitForTimeout(2200);
  await foto("4b-gravando");
  await p.getByText("Gravada ✓").waitFor({ timeout: 15000 });
  await foto("4c-gravada");

  // Ouve a própria tomada e o original.
  await p.getByRole("button", { name: "Ouvir a minha tomada" }).click();
  await p.waitForTimeout(800);
  await p.getByRole("button", { name: "Ouvir a minha tomada" }).click();
  await p.getByRole("button", { name: /Próxima/ }).click();

  // Grava todas seguidas.
  await p.getByText("Mais opções").click();
  await p.getByRole("button", { name: /Gravar todas seguidas/ }).click();
  await p.getByRole("link", { name: /Resultado 3\/3/ }).waitFor({ timeout: 40000 });
  const tomadas = await p.evaluate(async () => {
    const db = await new Promise((r) => { const q = indexedDB.open("dubla-brasil"); q.onsuccess = () => r(q.result); });
    const dubs = await new Promise((r) => { const q = db.transaction("dubs").objectStore("dubs").getAll(); q.onsuccess = () => r(q.result); });
    return Object.entries(dubs[0].tomadas).map(([id, t]) => ({ id, inicioMs: Math.round(t.inicioMs), duracaoMs: Math.round(t.duracaoMs), bytes: t.audio.size }));
  });
  console.log("Tomadas salvas:", JSON.stringify(tomadas));

  await p.getByRole("link", { name: /Resultado 3\/3/ }).click();
  await p.getByText("Sessão de estreia").waitFor();
  await p.waitForFunction(() => !document.querySelector(".controles button")?.disabled);
  await p.getByRole("button", { name: /Assistir/ }).click();
  await p.waitForTimeout(2500);
  await foto("6-sessao");
  await p.getByRole("button", { name: /Pausar/ }).click();

  const download = p.waitForEvent("download", { timeout: 60000 });
  await p.getByRole("button", { name: /Baixar vídeo/ }).click();
  await p.waitForTimeout(1500);
  await foto("7-exportando");
  const d = await download;
  const arquivo = path.join(SAIDA, d.suggestedFilename());
  await d.saveAs(arquivo);
  console.log("Vídeo baixado:", d.suggestedFilename(), fs.statSync(arquivo).size, "bytes");

  await p.getByRole("link", { name: "Meus dubs" }).click();
  await p.getByText("3/3 falas gravadas").waitFor();
  await foto("8-meus-dubs");

  console.log(erros.length ? "ERROS NO CONSOLE:\n" + erros.join("\n") : "Sem erros no console.");
  await navegador.close();
})().catch((e) => {
  console.error("FALHOU:", e);
  process.exit(1);
});
