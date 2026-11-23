// Teste da publicação de cena longa (versão 3.1): uma cena de 1:35 com imagem difícil de comprimir
// precisa caber no limite de 15 MB da galeria e aparecer no feed. Gera o vídeo de teste com o ffmpeg.
const { chromium, devices } = require("playwright");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { entrarAdmin, esperarFila } = require("./auxiliar.cjs");
const BASE = process.argv[2] || "http://localhost:4174/";
const SERVIDOR = "http://localhost:54399";
const SAIDA = path.join(__dirname, "saida");
fs.mkdirSync(SAIDA, { recursive: true });
const LONGO = path.join(SAIDA, "cena-longa.mp4");
const SRT = path.join(SAIDA, "cena-longa.srt");

(async () => {
  if (!fs.existsSync(LONGO))
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30,noise=alls=30:allf=t+u", "-f", "lavfi", "-i", "sine=frequency=330:sample_rate=44100",
      "-t", "95", "-c:v", "libx264", "-preset", "ultrafast", "-b:v", "4M", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-shortest", LONGO]);
  fs.writeFileSync(SRT, "1\n00:00:02,000 --> 00:00:04,500\nPrimeira fala da cena longa.\n\n2\n00:01:30,000 --> 00:01:33,000\nÚltima fala.\n");

  const navegador = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
  const erros = [];
  const nova = async (o) => {
    const pg = await (await navegador.newContext({ ...o, permissions: ["microphone"] })).newPage();
    pg.on("pageerror", (e) => erros.push(String(e)));
    pg.on("console", (m) => m.type() === "error" && !/status of 4\d\d/.test(m.text()) && erros.push(m.text()));
    return pg;
  };
  const adm = await nova({ viewport: { width: 1280, height: 900 } });
  await entrarAdmin(adm, BASE);
  await adm.getByRole("link", { name: /Adicionar vídeo/ }).first().click();
  const [v] = await Promise.all([adm.waitForEvent("filechooser"), adm.getByRole("button", { name: /Escolher o vídeo da cena/ }).click()]);
  await v.setFiles(LONGO);
  await adm.locator(".palco video").waitFor();
  const [s] = await Promise.all([adm.waitForEvent("filechooser"), adm.getByRole("button", { name: /Importar legendas/ }).click()]);
  await s.setFiles(SRT);
  await adm.getByRole("heading", { name: "Falas (2)" }).waitFor();
  await adm.getByLabel("Título").fill("Cena longa");
  await adm.getByRole("button", { name: /Salvar cena/ }).click();
  await adm.getByRole("heading", { name: "Administração" }).waitFor({ timeout: 120000 });
  await esperarFila(adm);
  const cenaId = (await (await fetch(`${SERVIDOR}/__estado`)).json()).cenas.find((c) => c.titulo === "Cena longa").id;

  const u = await nova({ ...devices["Pixel 7"] });
  await u.goto(BASE + "#/cena/" + cenaId);
  await u.getByRole("button", { name: /Entrar no estúdio/ }).click();
  await u.locator(".estudio").waitFor();
  await u.waitForFunction(() => document.querySelector("video")?.readyState >= 2);
  await u.getByRole("button", { name: /Gravar esta fala/ }).click();
  await u.getByRole("link", { name: /Resultado 1\/2/ }).waitFor({ timeout: 30000 });
  await u.getByRole("link", { name: /Resultado 1\/2/ }).click();
  await u.waitForFunction(() => !document.querySelector(".controles .botao-verde")?.disabled);
  await u.getByRole("button", { name: /Publicar na galeria/ }).click();
  await u.getByRole("heading", { name: "Escolha seu apelido" }).waitFor();
  await u.locator("#apelido").fill("Longo_123");
  await u.getByRole("button", { name: "Continuar" }).click();
  const t0 = Date.now();
  await u.waitForURL(/#\/galeria\?p=/, { timeout: 400000 });
  await u.locator(".post").first().waitFor();
  const estado = await (await fetch(`${SERVIDOR}/__estado`)).json();
  const pub = estado.publicacoes[0];
  const r = await fetch(`${SERVIDOR}/storage/v1/object/public/dubs/${pub.video_path}`);
  const mb = (await r.arrayBuffer()).byteLength / 1024 / 1024;
  console.log(`Cena de 1:35 publicada em ${((Date.now() - t0) / 1000).toFixed(0)} s, vídeo de ${mb.toFixed(1)} MB (limite 15 MB) e aparece na galeria:`, mb < 15 ? "ok" : "FALHOU");
  await u.screenshot({ path: path.join(SAIDA, "pl-galeria.png") });
  console.log(erros.length ? "ERROS:\n" + erros.join("\n") : "Sem erros no console.");
  await navegador.close();
})().catch((e) => {
  console.error("FALHOU:", e);
  process.exit(1);
});
