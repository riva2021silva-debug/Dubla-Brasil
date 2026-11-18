// Teste "sem buraco" (versão 3.6): cena com 3 s sem fala marcada entre duas falas, mas com a voz original tocando.
// Quem dubla TODOS os personagens não pode ouvir a voz original no buraco; a música continua.
// Vídeo de teste: "voz" = 880 Hz no centro o tempo todo; "música" = 330 Hz só na esquerda.
const { chromium, devices } = require("playwright");
const fs = require("fs");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");
const { entrarAdmin } = require("./auxiliar.cjs");
const BASE = process.argv[2] || "http://localhost:4174/";
const SERVIDOR = "http://localhost:54399";
const SAIDA = path.join(__dirname, "saida");
fs.mkdirSync(SAIDA, { recursive: true });
const VIDEO = path.join(SAIDA, "cena-buraco.mp4");
const SRT = path.join(SAIDA, "cena-buraco.srt");
const SILENCIO = path.join(SAIDA, "microfone-silencio.wav");
const db = (arq, ini, dur, freq) => {
  const out = spawnSync("ffmpeg", ["-hide_banner", "-ss", String(ini), "-t", String(dur), "-i", arq, "-af", `pan=mono|c0=0.5*c0+0.5*c1,bandpass=f=${freq}:width_type=h:w=30,astats`, "-f", "null", "-"], { encoding: "utf8" }).stderr;
  const m = /RMS level dB: (-?[\d.]+|-inf)/.exec(out);
  return m ? (m[1] === "-inf" ? -120 : Number(m[1])) : -120;
};

(async () => {
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30", "-f", "lavfi", "-i",
    "aevalsrc=0.3*sin(2*PI*330*t)+0.3*sin(2*PI*880*t)|0.3*sin(2*PI*880*t):s=48000:c=stereo", "-t", "12", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-shortest", VIDEO]);
  if (!fs.existsSync(SILENCIO)) execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono", "-t", "30", SILENCIO]);
  fs.writeFileSync(SRT, "1\n00:00:02,000 --> 00:00:04,000\nPrimeira fala.\n\n2\n00:00:07,000 --> 00:00:09,000\nSegunda fala.\n");

  const navegador = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${SILENCIO}`, "--autoplay-policy=no-user-gesture-required"] });
  const erros = [];
  const nova = async (o) => {
    const pg = await (await navegador.newContext({ ...o, permissions: ["microphone"], acceptDownloads: true })).newPage();
    pg.on("pageerror", (e) => erros.push(String(e)));
    pg.on("console", (m) => m.type() === "error" && !/status of 4\d\d/.test(m.text()) && erros.push(m.text()));
    return pg;
  };
  const adm = await nova({ viewport: { width: 1280, height: 900 } });
  await entrarAdmin(adm, BASE);
  await adm.getByRole("link", { name: /Adicionar vídeo/ }).first().click();
  const [v] = await Promise.all([adm.waitForEvent("filechooser"), adm.getByRole("button", { name: /Escolher o vídeo da cena/ }).click()]);
  await v.setFiles(VIDEO);
  await adm.locator(".palco video").waitFor();
  const [s] = await Promise.all([adm.waitForEvent("filechooser"), adm.getByRole("button", { name: /Importar legendas/ }).click()]);
  await s.setFiles(SRT);
  await adm.getByRole("heading", { name: "Falas (2)" }).waitFor();
  await adm.getByLabel("Personagem", { exact: true }).nth(1).selectOption({ index: 1 }); // 2ª fala do 2º personagem
  await adm.getByLabel("Título").fill("Cena do buraco");
  await adm.getByRole("button", { name: /Salvar cena/ }).click();
  await adm.getByRole("heading", { name: "Administração" }).waitFor({ timeout: 60000 });
  const cenaId = (await (await fetch(`${SERVIDOR}/__estado`)).json()).cenas.find((c) => c.titulo === "Cena do buraco").id;

  const u = await nova({ ...devices["Pixel 7"] });
  await u.goto(BASE + "#/cena/" + cenaId);
  await u.getByRole("button", { name: /Entrar no estúdio/ }).click(); // todos os personagens já vêm escolhidos
  await u.locator(".estudio").waitFor();
  await u.waitForFunction(() => document.querySelector("video")?.readyState >= 2);
  await u.getByText("Mais opções").click();
  await u.getByRole("button", { name: /Gravar todas seguidas/ }).click();
  await u.getByRole("link", { name: /Resultado 2\/2/ }).waitFor({ timeout: 40000 });
  await u.getByRole("link", { name: /Resultado 2\/2/ }).click();
  await u.waitForFunction(() => !document.querySelector(".controles .botao-verde")?.disabled);
  const dl = u.waitForEvent("download", { timeout: 90000 });
  await u.getByRole("button", { name: /Salvar na galeria/ }).click();
  const arq = path.join(SAIDA, "sem-buraco.mp4");
  await (await dl).saveAs(arq);
  const vozBuraco = db(arq, 5, 1, 880), musicaBuraco = db(arq, 5, 1, 330), vozOriginal = db(VIDEO, 5, 1, 880);
  console.log(`No buraco (5–6 s): voz original ${vozBuraco.toFixed(0)} dB (no vídeo original: ${vozOriginal.toFixed(0)} dB), música ${musicaBuraco.toFixed(0)} dB`);
  console.log("Dublando todos os personagens, a voz original não volta no buraco entre as falas:", vozBuraco < vozOriginal - 25 && musicaBuraco > -30 ? "ok" : "FALHOU");
  console.log(erros.length ? "ERROS:\n" + erros.join("\n") : "Sem erros no console.");
  await navegador.close();
})().catch((e) => {
  console.error("FALHOU:", e);
  process.exit(1);
});
