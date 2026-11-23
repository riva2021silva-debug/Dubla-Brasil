// Modo Cantar (versão 5.0): o admin cadastra uma música ("🎤 É uma música") e salva; a IA separa sozinha o
// instrumental e a voz do cantor. A pessoa acha a música em "🎤 Cantar músicas", canta com o instrumental tocando
// e ganha a nota de afinação. Use MODELO=<arquivo .onnx> para não baixar 180 MB.
const { chromium, devices } = require("playwright");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { entrarAdmin, esperarFila } = require("./auxiliar.cjs");
const BASE = process.argv[2] || "http://localhost:4174/";
const S = "http://localhost:54399";
const SAIDA = path.join(__dirname, "saida");
const FIX = path.join(__dirname, "fixtures");
fs.mkdirSync(SAIDA, { recursive: true });
const VIDEO = path.join(SAIDA, "musica-teste.mp4");
const SRT = path.join(SAIDA, "musica-teste.srt");
const estado = async () => (await fetch(`${S}/__estado`)).json();

(async () => {
  const MUS = "aevalsrc=0.12*sin(2*PI*220*t)+0.08*sin(2*PI*277*t)|0.12*sin(2*PI*330*t)+0.08*sin(2*PI*165*t):s=44100:c=stereo";
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", path.join(FIX, "cena-fala", "video.mp4"), "-f", "lavfi", "-i", MUS, "-filter_complex", "[0:a]pan=stereo|c0=0.8*c0|c1=0.8*c0[f];[f][1:a]amix=inputs=2:normalize=0[a]", "-map", "0:v", "-map", "[a]", "-t", "16", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", VIDEO]);
  fs.writeFileSync(SRT, "1\n00:00:01,000 --> 00:00:05,000\nPrimeiro verso da canção\n\n2\n00:00:06,000 --> 00:00:10,000\nSegundo verso da canção\n");

  let fechar = () => {};
  const nav = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
  const ctxAdm = await nav.newContext({ viewport: { width: 1280, height: 1000 } });
  if (process.env.MODELO) {
    const http = require("http");
    const tamanho = fs.statSync(process.env.MODELO).size;
    const srv = http.createServer((req, res) => {
      res.writeHead(200, { "Access-Control-Allow-Origin": "*", "Content-Type": "application/octet-stream", "Content-Length": tamanho });
      fs.createReadStream(process.env.MODELO).pipe(res);
    }).listen(54411);
    fechar = () => srv.close();
    await ctxAdm.addInitScript(() => localStorage.setItem("dubla-brasil:url-modelo-fundo", "http://localhost:54411/htdemucs.onnx"));
  }
  const erros = [];
  const adm = await ctxAdm.newPage();
  adm.on("pageerror", (e) => erros.push(String(e)));
  await entrarAdmin(adm, BASE, { iaAutomatica: true });
  await adm.getByRole("link", { name: /Adicionar vídeo/ }).first().click();
  const [v] = await Promise.all([adm.waitForEvent("filechooser"), adm.getByRole("button", { name: /Escolher o vídeo da cena/ }).click()]);
  await v.setFiles(VIDEO);
  await adm.locator(".palco video").waitFor();
  const [s] = await Promise.all([adm.waitForEvent("filechooser"), adm.getByRole("button", { name: /Importar legendas/ }).click()]);
  await s.setFiles(SRT);
  await adm.getByLabel("Título").fill("Canção de teste");
  await adm.getByLabel("🎤 É uma música").check();
  await adm.getByRole("button", { name: /Salvar cena/ }).click();
  await adm.getByRole("heading", { name: "Administração" }).waitFor({ timeout: 120000 });
  await esperarFila(adm, 1200000);
  console.log("Salvou a música e voltou para a Administração: ok");
  await adm.getByText(/pronta e publicada/).waitFor({ timeout: 900000 });
  console.log("A IA começou sozinha e separou o instrumental e a voz do cantor: ok");
  const cena = (await estado()).cenas.find((c) => c.titulo === "Canção de teste");
  console.log("No servidor: tipo música, com trilha (instrumental) e voz:", cena.tipo === "musica" && cena.fundo_path && cena.voz_path ? "ok" : `FALHOU (${JSON.stringify({ tipo: cena.tipo, f: cena.fundo_path, v: cena.voz_path })})`);

  // Quem usa o app: acha a música e canta.
  const u = await (await nav.newContext({ ...devices["Pixel 7"], permissions: ["microphone"] })).newPage();
  u.on("pageerror", (e) => erros.push(String(e)));
  await u.goto(BASE + "#/cenas");
  await u.getByRole("button", { name: "🎤 Cantar músicas" }).click();
  await u.getByRole("heading", { name: "🎤 Músicas" }).waitFor();
  await u.locator(".selo-musica").first().waitFor();
  console.log("Filtro “🎤 Cantar músicas” mostra a música com o selo: ok");
  await u.getByText("Canção de teste").click();
  await u.getByRole("button", { name: /Entrar no estúdio/ }).click();
  await u.locator(".estudio").waitFor();
  await u.locator(".aviso-cantar").waitFor();
  console.log("Estúdio avisa: Modo Cantar, use fone: ok");
  await u.waitForFunction(() => document.querySelector("video")?.readyState >= 2);
  await u.getByRole("button", { name: "Gravar esta fala" }).click();
  await u.locator(".nota-afinacao").waitFor({ timeout: 40000 });
  const nota = (await u.locator(".nota-afinacao").innerText()).replace(/\s+/g, " ");
  console.log(`Depois de cantar o trecho aparece a nota (${nota.replace(/\s+/g, " ")}):`, /Afinação \d+%/.test(nota) ? "ok" : "FALHOU");
  await u.screenshot({ path: path.join(SAIDA, "cantar-estudio.png") });
  await u.getByRole("link", { name: /Resultado/ }).click();
  await u.getByText(/Nota final:/).waitFor();
  console.log("Resultado mostra a nota final: ok");
  console.log(erros.length ? "ERROS:\n" + erros.join("\n") : "Sem erros no console.");
  fechar();
  await nav.close();
})().catch((e) => { console.error("FALHOU:", e); process.exit(1); });
