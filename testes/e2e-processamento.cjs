// Processamento automático (versão 5.7): o admin edita e toca em "Salvar". O app volta na hora para a Administração e,
// sozinho, em segundo plano: deixa o vídeo leve, envia, separa as vozes com a IA (trilha de fundo) e só depois publica.
// Dá para adicionar outra cena e andar pelo app enquanto isso. Use MODELO=<arquivo .onnx> para não baixar 180 MB.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { entrarAdmin } = require("./auxiliar.cjs");
const BASE = process.argv[2] || "http://localhost:4174/";
const S = "http://localhost:54399";
const SAIDA = path.join(__dirname, "saida");
const FIX = path.join(__dirname, "fixtures");
fs.mkdirSync(SAIDA, { recursive: true });
const VIDEO = path.join(SAIDA, "cena-processamento.mp4");
const SRT = path.join(SAIDA, "cena-processamento.srt");
const estado = async () => (await fetch(`${S}/__estado`)).json();
const ok = (c) => (c ? "ok" : "FALHOU");

(async () => {
  const MUS = "aevalsrc=0.12*sin(2*PI*220*t)+0.08*sin(2*PI*277*t)|0.12*sin(2*PI*330*t)+0.08*sin(2*PI*165*t):s=44100:c=stereo";
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", path.join(FIX, "cena-fala", "video.mp4"), "-f", "lavfi", "-i", MUS, "-filter_complex", "[0:a]pan=stereo|c0=0.8*c0|c1=0.8*c0[f];[f][1:a]amix=inputs=2:normalize=0[a]", "-map", "0:v", "-map", "[a]", "-t", "12", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", VIDEO]);
  fs.writeFileSync(SRT, "1\n00:00:01,000 --> 00:00:10,000\nFala\n");

  let fechar = () => {};
  const nav = await chromium.launch();
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 1000 } });
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
  await entrarAdmin(p, BASE, { iaAutomatica: true });

  const adicionar = async (titulo) => {
    await p.getByRole("link", { name: /Adicionar vídeo/ }).first().click();
    const [v] = await Promise.all([p.waitForEvent("filechooser"), p.getByRole("button", { name: /Escolher o vídeo da cena/ }).click()]);
    await v.setFiles(VIDEO);
    await p.locator(".palco video").waitFor();
    const [s] = await Promise.all([p.waitForEvent("filechooser"), p.getByRole("button", { name: /Importar legendas/ }).click()]);
    await s.setFiles(SRT);
    await p.getByLabel("Título").fill(titulo);
    const t0 = Date.now();
    await p.getByRole("button", { name: /Salvar cena/ }).click();
    await p.getByRole("heading", { name: "Administração" }).waitFor({ timeout: 20000 });
    return Date.now() - t0;
  };

  const ms = await adicionar("Cena automática A");
  console.log(`Salvar volta na hora para a Administração (${(ms / 1000).toFixed(1)} s):`, ok(ms < 10000));
  await p.locator("#processamento").getByText("Cena automática A").waitFor();
  console.log("Painel mostra a cena sendo preparada sozinha: ok");
  await p.locator("#processamento").getByText(/✨/).first().waitFor({ timeout: 120000 });
  const a1 = (await estado()).cenas.find((c) => c.titulo === "Cena automática A");
  console.log("Enquanto a IA trabalha, a cena fica escondida (não publicada):", ok(a1 && a1.publicada === false && !a1.fundo_path));

  // Enquanto isso: adiciona outra cena e passeia pelo app.
  await adicionar("Cena automática B");
  console.log("Deu para adicionar outra cena durante o processamento: ok");
  await p.goto(BASE + "#/galeria");
  await p.locator(".selo-processando:visible").first().waitFor();
  console.log("Saiu da Administração e o selo ⏳ continua no topo: ok");
  await p.goto(BASE + "#/cenas");
  await p.waitForTimeout(1500);
  await p.goto(BASE + "#/admin");

  await p.locator("#processamento li.feito").nth(1).waitFor({ timeout: 1200000 });
  await p.screenshot({ path: path.join(SAIDA, "processamento.png") });
  const fim = (await estado()).cenas.filter((c) => /Cena automática/.test(c.titulo));
  console.log("As 2 cenas ficaram com trilha de fundo e publicadas sozinhas:", ok(fim.length === 2 && fim.every((c) => c.fundo_path && c.publicada === true)), fim.map((c) => [c.titulo, !!c.fundo_path, c.publicada]));
  const textos = await p.locator("#processamento li").allInnerTexts();
  console.log("Painel: “pronta e publicada” nas duas:", ok(textos.filter((t) => /pronta e publicada/.test(t)).length === 2));

  // Quem usa o app vê as duas cenas.
  const u = await (await nav.newContext()).newPage();
  await u.goto(BASE + "#/cenas");
  await u.getByText("Cena automática B").waitFor({ timeout: 20000 });
  console.log("Quem usa o app já vê as cenas novas: ok");
  console.log(erros.length ? "ERROS:\n" + erros.join("\n") : "Sem erros no console.");
  fechar();
  await nav.close();
})().catch((e) => {
  console.error("FALHOU:", e);
  process.exit(1);
});
