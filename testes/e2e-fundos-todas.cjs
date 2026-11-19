// "✨ Gerar as trilhas" (versão 4.3): no Admin, um botão gera a trilha de fundo (som sem as vozes) de todas as cenas
// que ainda não têm. Confere que a cena ganha a trilha no servidor e que, no resultado da dublagem, na fala da pessoa
// a voz original some e a música continua. Use MODELO=<arquivo .onnx> para não baixar 180 MB.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");
const { entrarAdmin } = require("./auxiliar.cjs");
const BASE = process.argv[2] || "http://localhost:4174/";
const SERVIDOR = "http://localhost:54399";
const SAIDA = path.join(__dirname, "saida");
const FIX = path.join(__dirname, "fixtures");
fs.mkdirSync(SAIDA, { recursive: true });
const VIDEO = path.join(SAIDA, "cena-fala-musica-2.mp4");
const SRT = path.join(SAIDA, "cena-fala-musica-2.srt");

(async () => {
  const MUS = "aevalsrc=0.12*sin(2*PI*220*t)+0.08*sin(2*PI*277*t)|0.12*sin(2*PI*330*t)+0.08*sin(2*PI*165*t):s=44100:c=stereo";
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", path.join(FIX, "cena-fala", "video.mp4"), "-f", "lavfi", "-i", MUS, "-filter_complex", "[0:a]pan=stereo|c0=0.8*c0|c1=0.8*c0[f];[f][1:a]amix=inputs=2:normalize=0[a]", "-map", "0:v", "-map", "[a]", "-t", "16", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", VIDEO]);
  fs.writeFileSync(SRT, "1\n00:00:01,000 --> 00:00:15,000\nFala\n");

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
  await entrarAdmin(p, BASE);
  // Aqui o teste é do botão "Gerar as trilhas" (todas de uma vez): desliga o começo automático depois de salvar
  // (esse é conferido no teste e2e-cantar).
  await p.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === "dubla-brasil:gerar-fundo") return;
      return original.call(this, k, v);
    };
  });
  // Duas cenas sem trilha de fundo (como as do servidor de verdade hoje).
  for (const titulo of ["Cena A sem fundo", "Cena B sem fundo"]) {
    await p.getByRole("link", { name: /Adicionar vídeo/ }).first().click();
    const [v] = await Promise.all([p.waitForEvent("filechooser"), p.getByRole("button", { name: /Escolher o vídeo da cena/ }).click()]);
    await v.setFiles(VIDEO);
    await p.locator(".palco video").waitFor();
    const [s] = await Promise.all([p.waitForEvent("filechooser"), p.getByRole("button", { name: /Importar legendas/ }).click()]);
    await s.setFiles(SRT);
    await p.getByLabel("Título").fill(titulo);
    await p.getByRole("button", { name: /Salvar cena/ }).click();
    await p.getByRole("heading", { name: "Administração" }).waitFor({ timeout: 120000 });
  }
  await p.getByText("2 de 2 cenas estão sem trilha de fundo").waitFor();
  const t0 = Date.now();
  await p.getByRole("button", { name: "✨ Gerar as 2 trilhas" }).click();
  await p.locator(".lista-otimizar li.feito").nth(1).waitFor({ timeout: 900000 });
  console.log(`As 2 trilhas geradas em ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  await p.screenshot({ path: path.join(SAIDA, "fundos-todas.png") });
  const estado = await (await fetch(`${SERVIDOR}/__estado`)).json();
  const comFundo = estado.cenas.filter((c) => c.fundo_path).length;
  console.log("As 2 cenas ganharam trilha de fundo no servidor:", comFundo === 2 ? "ok" : `FALHOU (${comFundo})`);
  await p.getByText("Todas as cenas têm trilha de fundo. ✅").waitFor({ timeout: 20000 });
  console.log("Painel mostra que todas têm trilha (resultado continua na tela):", (await p.locator(".lista-otimizar li.feito").count()) === 2 ? "ok" : "FALHOU");

  // A trilha não pode ter a voz: compara com a música pura (correlação) e com a fala.
  const fundo = estado.cenas[0].fundo_path;
  const arq = path.join(SAIDA, "fundo-gerado.wav");
  fs.writeFileSync(arq, Buffer.from(await (await fetch(`${SERVIDOR}/storage/v1/object/public/midias/${fundo}`)).arrayBuffer()));
  const raw = (a, ex = []) => { const b = execFileSync("ffmpeg", ["-v", "error", ...ex, "-i", a, "-t", "16", "-ac", "1", "-ar", "16000", "-f", "f32le", "-"], { maxBuffer: 1e9 }); return new Float32Array(b.buffer, b.byteOffset, b.length / 4); };
  const corr = (a, b) => { let ab = 0, aa = 0, bb = 0; const n = Math.min(a.length, b.length); for (let i = 0; i < n; i++) { ab += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i]; } return ab / Math.sqrt(aa * bb); };
  const g = raw(arq), fala = raw(path.join(FIX, "cena-fala", "video.mp4")), mus = raw(MUS, ["-f", "lavfi"]);
  const cM = corr(g, mus), cF = corr(g, fala);
  console.log(`Trilha gerada: parecida com a música ${cM.toFixed(2)} · com a fala ${cF.toFixed(2)}`);
  console.log("A trilha tem a música e não tem a voz:", cM > 0.8 && Math.abs(cF) < 0.2 ? "ok" : "FALHOU");
  console.log(erros.length ? "ERROS:\n" + erros.join("\n") : "Sem erros no console.");
  fechar();
  await nav.close();
})().catch((e) => {
  console.error("FALHOU:", e);
  process.exit(1);
});
