// Celular (versão 5.7): ao salvar, a cena é preparada sozinha (a IA separa as vozes em segundo plano), mas a IA
// pesada PARA enquanto o admin está no estúdio ou no resultado (para a dublagem não picotar) e volta sozinha depois.
// Use MODELO=<arquivo .onnx> para não baixar 180 MB.
const { chromium, devices } = require("playwright");
const fs = require("fs");
const path = require("path");
const { entrarAdmin } = require("./auxiliar.cjs");
const BASE = process.argv[2] || "http://localhost:4174/";
const FIX = path.join(__dirname, "fixtures");
(async () => {
  let fechar = () => {};
  const nav = await chromium.launch();
  const ctx = await nav.newContext({ ...devices["Pixel 7"] });
  if (process.env.MODELO) {
    const http = require("http");
    const tamanho = fs.statSync(process.env.MODELO).size;
    const srv = http.createServer((req, res) => {
      res.writeHead(200, { "Access-Control-Allow-Origin": "*", "Content-Type": "application/octet-stream", "Content-Length": tamanho });
      fs.createReadStream(process.env.MODELO).pipe(res);
    }).listen(54411);
    fechar = () => srv.close();
    await ctx.addInitScript(() => localStorage.setItem("dubla-brasil:url-modelo-fundo", "http://localhost:54411/htdemucs.onnx"));
  }
  const p = await ctx.newPage();
  const erros = [];
  p.on("pageerror", (e) => erros.push(String(e)));
  let vivos = 0, criados = 0;
  p.on("worker", (w) => {
    if (!/trabalhador/.test(w.url())) return;
    vivos++;
    criados++;
    w.on("close", () => vivos--);
  });
  await entrarAdmin(p, BASE, { iaAutomatica: true });
  await p.getByRole("link", { name: /Adicionar vídeo/ }).first().click();
  const [v] = await Promise.all([p.waitForEvent("filechooser"), p.getByRole("button", { name: /Escolher o vídeo da cena/ }).click()]);
  await v.setFiles(path.join(FIX, "cena-teste", "video.mp4"));
  await p.locator(".palco video").waitFor();
  const [s] = await Promise.all([p.waitForEvent("filechooser"), p.getByRole("button", { name: /Importar legendas/ }).click()]);
  await s.setFiles(path.join(FIX, "cena-teste.srt"));
  await p.getByLabel("Título").fill("Cena salva no celular");
  await p.getByRole("button", { name: /Salvar cena/ }).click();
  await p.getByRole("heading", { name: "Administração" }).waitFor({ timeout: 20000 });
  for (let i = 0; i < 240 && !vivos; i++) await p.waitForTimeout(500);
  console.log("No celular a cena é preparada sozinha (a IA começou):", vivos === 1 ? "ok" : `FALHOU (${vivos})`);
  await p.goto(BASE + "#/estudio/qualquer");
  await p.waitForTimeout(2000);
  console.log("No estúdio a IA para (não picota a dublagem):", vivos === 0 ? "ok" : `FALHOU (${vivos})`);
  await p.goto(BASE + "#/admin");
  for (let i = 0; i < 240 && !vivos; i++) await p.waitForTimeout(500);
  console.log("Saiu do estúdio e a IA voltou sozinha:", vivos === 1 && criados === 2 ? "ok" : `FALHOU (${vivos}, ${criados})`);
  console.log(erros.length ? "ERROS:\n" + erros.join("\n") : "Sem erros no console.");
  fechar();
  await nav.close();
})().catch((e) => { console.error("FALHOU:", e); process.exit(1); });
