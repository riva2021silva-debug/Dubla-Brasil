// Celular (versão 5.1): ao salvar uma cena sem trilha de fundo, a IA pesada NÃO começa sozinha (ela travava o
// celular e o vídeo picotava). Aparece o aviso para gerar pelo computador.
const { chromium, devices } = require("playwright");
const path = require("path");
const { entrarAdmin } = require("./auxiliar.cjs");
const BASE = process.argv[2] || "http://localhost:4174/";
const FIX = path.join(__dirname, "fixtures");
(async () => {
  const nav = await chromium.launch();
  const p = await (await nav.newContext({ ...devices["Pixel 7"] })).newPage();
  const erros = [];
  p.on("pageerror", (e) => erros.push(String(e)));
  let trabalhadores = 0;
  p.on("worker", (w) => /trabalhador/.test(w.url()) && trabalhadores++);
  await entrarAdmin(p, BASE);
  await p.getByRole("link", { name: /Adicionar vídeo/ }).first().click();
  const [v] = await Promise.all([p.waitForEvent("filechooser"), p.getByRole("button", { name: /Escolher o vídeo da cena/ }).click()]);
  await v.setFiles(path.join(FIX, "cena-teste", "video.mp4"));
  await p.locator(".palco video").waitFor();
  const [s] = await Promise.all([p.waitForEvent("filechooser"), p.getByRole("button", { name: /Importar legendas/ }).click()]);
  await s.setFiles(path.join(FIX, "cena-teste.srt"));
  await p.getByLabel("Título").fill("Cena salva no celular");
  await p.getByRole("button", { name: /Salvar cena/ }).click();
  await p.getByRole("heading", { name: "Administração" }).waitFor({ timeout: 120000 });
  await p.getByText(/Cena salva! A trilha de fundo é gerada por uma IA pesada/).waitFor({ timeout: 15000 });
  await p.waitForTimeout(3000);
  const gerando = await p.getByRole("button", { name: "Gerando…" }).count();
  console.log("No celular a IA não começa sozinha (aviso para usar o computador):", gerando === 0 && trabalhadores === 0 ? "ok" : `FALHOU (${gerando}, ${trabalhadores})`);
  console.log(erros.length ? "ERROS:\n" + erros.join("\n") : "Sem erros no console.");
  await nav.close();
})().catch((e) => { console.error("FALHOU:", e); process.exit(1); });
