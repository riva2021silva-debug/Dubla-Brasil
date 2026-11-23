// Teste de cena de 2 minutos (versão 3.2): o admin envia um vídeo pesado de 2:30, o app avisa e corta para 2:00
// (cabendo nos 50 MB do servidor); depois um usuário dubla e publica na galeria (cabendo nos 15 MB).
const { chromium, devices } = require("playwright");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { entrarAdmin, esperarFila } = require("./auxiliar.cjs");
const BASE = process.argv[2] || "http://localhost:4174/";
const SERVIDOR = "http://localhost:54399";
const SAIDA = path.join(__dirname, "saida");
fs.mkdirSync(SAIDA, { recursive: true });
const PESADO = path.join(SAIDA, "cena-2min30.mp4");
const SRT = path.join(SAIDA, "cena-2min.srt");
const durQuadros = (arq) => {
  const t = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "frame=pts_time", "-of", "csv=p=0", arq]).toString().trim().split("\n").map(Number);
  return t[t.length - 1] - t[0];
};

(async () => {
  if (!fs.existsSync(PESADO))
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30,noise=alls=30:allf=t+u", "-f", "lavfi", "-i", "sine=frequency=330:sample_rate=44100",
      "-t", "150", "-c:v", "libx264", "-preset", "ultrafast", "-b:v", "4M", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-shortest", PESADO]);
  fs.writeFileSync(SRT, "1\n00:00:02,000 --> 00:00:04,500\nPrimeira fala.\n\n2\n00:01:55,000 --> 00:01:58,000\nÚltima fala.\n");
  console.log(`Vídeo de teste: 2:30, ${(fs.statSync(PESADO).size / 1024 / 1024).toFixed(0)} MB`);

  const navegador = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
  const erros = [];
  const nova = async (o) => {
    const pg = await (await navegador.newContext({ ...o, permissions: ["microphone"] })).newPage();
    pg.on("pageerror", (e) => erros.push(String(e)));
    pg.on("console", (m) => m.type() === "error" && !/status of 4\d\d/.test(m.text()) && erros.push(m.text()));
    return pg;
  };
  const adm = await nova({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  await entrarAdmin(adm, BASE);
  await adm.getByRole("link", { name: /Adicionar vídeo/ }).first().click();
  await adm.getByText("MP4 ou WebM, de até 2 minutos.").waitFor();
  const [v] = await Promise.all([adm.waitForEvent("filechooser"), adm.getByRole("button", { name: /Escolher o vídeo da cena/ }).click()]);
  await v.setFiles(PESADO);
  await adm.getByText(/O vídeo tem 2:30.*até 2 minutos/).waitFor({ timeout: 20000 });
  console.log("Editor avisa que o vídeo passou de 2 minutos: ok");
  await adm.getByRole("button", { name: /Cortar para 2 minutos/ }).click();
  await adm.getByText("Termina em 2:00,0").waitFor();
  console.log("Editar vídeo já abre com o corte em 2:00: ok");
  await adm.getByRole("button", { name: /Aplicar edição/ }).click();
  await adm.getByText(/Vídeo editado \(2:0/).waitFor({ timeout: 300000 });
  const [s] = await Promise.all([adm.waitForEvent("filechooser"), adm.getByRole("button", { name: /Importar legendas/ }).click()]);
  await s.setFiles(SRT);
  await adm.getByRole("heading", { name: "Falas (2)" }).waitFor();
  await adm.getByLabel("Título").fill("Cena de dois minutos");
  await adm.getByRole("button", { name: /Salvar cena/ }).click();
  await adm.getByRole("heading", { name: "Administração" }).waitFor({ timeout: 180000 });
  await esperarFila(adm);
  const cena = (await (await fetch(`${SERVIDOR}/__estado`)).json()).cenas.find((c) => c.titulo === "Cena de dois minutos");
  const arqCena = path.join(SAIDA, "dois-min-cena" + path.extname(cena.video_path));
  fs.writeFileSync(arqCena, Buffer.from(await (await fetch(`${SERVIDOR}/storage/v1/object/public/midias/${cena.video_path}`)).arrayBuffer()));
  const mbCena = fs.statSync(arqCena).size / 1024 / 1024;
  const dCena = durQuadros(arqCena);
  console.log(`Cena salva: ${dCena.toFixed(1)} s, ${mbCena.toFixed(1)} MB (máximo 50 MB):`, Math.abs(dCena - 120) < 2 && mbCena < 50 ? "ok" : "FALHOU");

  const u = await nova({ ...devices["Pixel 7"] });
  await u.goto(BASE + "#/cena/" + cena.id);
  await u.getByRole("button", { name: /Entrar no estúdio/ }).click();
  await u.locator(".estudio").waitFor();
  await u.waitForFunction(() => document.querySelector("video")?.readyState >= 2);
  await u.getByRole("button", { name: /Gravar esta fala/ }).click();
  await u.getByRole("link", { name: /Resultado 1\/2/ }).waitFor({ timeout: 30000 });
  await u.getByRole("link", { name: /Resultado 1\/2/ }).click();
  await u.waitForFunction(() => !document.querySelector(".controles .botao-verde")?.disabled);
  await u.getByRole("button", { name: /Publicar na galeria/ }).click();
  await u.getByRole("heading", { name: "Escolha seu apelido" }).waitFor();
  await u.locator("#apelido").fill("Dois_Min");
  await u.getByRole("button", { name: "Continuar" }).click();
  await u.waitForURL(/#\/galeria\?p=/, { timeout: 400000 });
  await u.locator(".post").first().waitFor();
  const pub = (await (await fetch(`${SERVIDOR}/__estado`)).json()).publicacoes.find((p) => p.cena_id === cena.id);
  const arqPub = path.join(SAIDA, "dois-min-galeria" + path.extname(pub.video_path));
  fs.writeFileSync(arqPub, Buffer.from(await (await fetch(`${SERVIDOR}/storage/v1/object/public/dubs/${pub.video_path}`)).arrayBuffer()));
  const mbPub = fs.statSync(arqPub).size / 1024 / 1024;
  const dims = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", arqPub]).toString().trim();
  console.log(`Publicado na galeria: ${durQuadros(arqPub).toFixed(1)} s, ${dims}, ${mbPub.toFixed(1)} MB (máximo 15 MB):`, mbPub < 15 ? "ok" : "FALHOU");
  console.log(erros.length ? "ERROS:\n" + erros.join("\n") : "Sem erros no console.");
  await navegador.close();
})().catch((e) => {
  console.error("FALHOU:", e);
  process.exit(1);
});
