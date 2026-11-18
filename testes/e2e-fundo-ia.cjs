// Teste "✨ Gerar trilha de fundo com IA" (versão 3.9): cena com fala + música; a IA (HTDemucs) tem que tirar a fala
// e deixar a música. Para não baixar 180 MB a cada teste, use MODELO=<arquivo .onnx> (senão baixa do Hugging Face).
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { entrarAdmin } = require("./auxiliar.cjs");
const BASE = process.argv[2] || "http://localhost:4174/";
const SERVIDOR = "http://localhost:54399";
const SAIDA = path.join(__dirname, "saida");
const FIX = path.join(__dirname, "fixtures");
fs.mkdirSync(SAIDA, { recursive: true });
const VIDEO = path.join(SAIDA, "cena-fala-musica.mp4");
const raw = (arq, extra = []) => {
  const b = execFileSync("ffmpeg", ["-v", "error", "-i", arq, ...extra, "-ac", "1", "-ar", "16000", "-f", "f32le", "-"], { maxBuffer: 1e9 });
  return new Float32Array(b.buffer, b.byteOffset, b.length / 4);
};
const corr = (a, b) => { let ab = 0, aa = 0, bb = 0; const n = Math.min(a.length, b.length); for (let i = 0; i < n; i++) { ab += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i]; } return ab / Math.sqrt(aa * bb); };

(async () => {
  // Vídeo: a fala do diálogo de teste no centro + uma "música" (acordes e batida) nos dois lados.
  const MUS = "aevalsrc=0.12*sin(2*PI*220*t)+0.08*sin(2*PI*277*t)+0.25*sin(2*PI*55*t)*lt(mod(t\\,0.5)\\,0.08)|0.12*sin(2*PI*330*t)+0.08*sin(2*PI*165*t)+0.25*sin(2*PI*55*t)*lt(mod(t\\,0.5)\\,0.08):s=44100:c=stereo";
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", path.join(FIX, "cena-fala", "video.mp4"), "-f", "lavfi", "-i", MUS, "-filter_complex", "[0:a]pan=stereo|c0=0.8*c0|c1=0.8*c0[f];[f][1:a]amix=inputs=2:normalize=0[a]", "-map", "0:v", "-map", "[a]", "-t", "16", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", VIDEO]);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", path.join(FIX, "cena-fala", "video.mp4"), "-t", "16", "-ac", "1", "-ar", "16000", "-f", "f32le", path.join(SAIDA, "fala16k.raw")]);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", MUS, "-t", "16", "-ac", "1", "-ar", "16000", "-f", "f32le", path.join(SAIDA, "musica16k.raw")]);
  const ler = (f) => { const b = fs.readFileSync(f); return new Float32Array(b.buffer, b.byteOffset, b.length / 4); };
  const fala = ler(path.join(SAIDA, "fala16k.raw")), musica = ler(path.join(SAIDA, "musica16k.raw"));

  let fecharServidor = () => {};
  const navegador = await chromium.launch();
  const ctx = await navegador.newContext({ viewport: { width: 1280, height: 1000 } });
  if (process.env.MODELO) {
    // Serve o modelo daqui mesmo (mandar 180 MB pelo Playwright derruba o navegador) e avisa o app do endereço.
    const http = require("http");
    const tamanho = fs.statSync(process.env.MODELO).size;
    const servidor = http.createServer((req, res) => {
      res.writeHead(200, { "Access-Control-Allow-Origin": "*", "Content-Type": "application/octet-stream", "Content-Length": tamanho });
      fs.createReadStream(process.env.MODELO).pipe(res);
    }).listen(54411);
    fecharServidor = () => servidor.close();
    await ctx.addInitScript(() => localStorage.setItem("dubla-brasil:url-modelo-fundo", "http://localhost:54411/htdemucs.onnx"));
  }
  const p = await ctx.newPage();
  const erros = [];
  p.on("pageerror", (e) => erros.push(String(e)));
  p.on("console", (m) => m.type() === "error" && erros.push(m.text()));
  p.on("crash", () => console.log("!!! a página travou (crash)"));
  p.on("worker", (w) => w.on("console", (m) => console.log("  [trabalhador]", m.text().slice(0, 200))));
  await entrarAdmin(p, BASE);
  await p.getByRole("link", { name: /Adicionar vídeo/ }).first().click();
  const [v] = await Promise.all([p.waitForEvent("filechooser"), p.getByRole("button", { name: /Escolher o vídeo da cena/ }).click()]);
  await v.setFiles(VIDEO);
  await p.locator(".palco video").waitFor();
  await p.getByLabel("Título").fill("Cena com trilha da IA");
  const t0 = Date.now();
  await p.getByRole("button", { name: "✨ Gerar", exact: true }).click();
  let ultimo = "";
  const relogio = setInterval(async () => {
    const t = await p.locator(".cartao-ia .pequeno").first().innerText().catch(() => "");
    if (t && t !== ultimo) console.log(`  [${((Date.now() - t0) / 1000).toFixed(0)} s] ${(ultimo = t)}`);
  }, 5000);
  await p.getByText(/Trilha de fundo pronta/).waitFor({ timeout: 1500000 });
  clearInterval(relogio);
  console.log(`Gerada em ${((Date.now() - t0) / 1000).toFixed(0)} s: ${await p.getByText(/Trilha de fundo pronta/).innerText()}`);
  await p.screenshot({ path: path.join(SAIDA, "fundo-ia.png") });
  // Uma fala mínima para salvar.
  await p.getByRole("button", { name: /Fala aqui/ }).click();
  await p.getByRole("button", { name: /Salvar cena/ }).click();
  await p.getByRole("heading", { name: "Administração" }).waitFor({ timeout: 120000 });
  const cena = (await (await fetch(`${SERVIDOR}/__estado`)).json()).cenas.find((c) => c.titulo === "Cena com trilha da IA");
  const arqFundo = path.join(SAIDA, "fundo-ia.wav");
  fs.writeFileSync(arqFundo, Buffer.from(await (await fetch(`${SERVIDOR}/storage/v1/object/public/midias/${cena.fundo_path}`)).arrayBuffer()));
  const fundo = raw(arqFundo), mistura = raw(VIDEO);
  console.log(`Vídeo original: correlação com a fala ${corr(mistura, fala).toFixed(2)}, com a música ${corr(mistura, musica).toFixed(2)}`);
  console.log(`Trilha da IA:   correlação com a fala ${corr(fundo, fala).toFixed(2)}, com a música ${corr(fundo, musica).toFixed(2)}`);
  console.log("A IA tirou a voz e deixou a música:", corr(fundo, fala) < 0.15 && corr(fundo, musica) > 0.9 ? "ok" : "FALHOU");
  console.log(erros.length ? "ERROS:\n" + erros.join("\n") : "Sem erros no console.");
  await navegador.close();
  fecharServidor();
})().catch((e) => {
  console.error("FALHOU:", e);
  process.exit(1);
});
