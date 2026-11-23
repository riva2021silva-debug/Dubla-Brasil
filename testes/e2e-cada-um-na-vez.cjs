// "Cada um na sua vez" (versão 4.1), como num estúdio de dublagem: Rose fala de 2,0 a 3,0 s e Jack logo depois,
// de 3,2 a 4,5 s. A pessoa dubla só a Rose (microfone em 600 Hz). Confere:
//  - antes de gravar aparece a contagem 3, 2, 1 com a imagem parada;
//  - a voz dela não entra na fala do Jack (nada de 600 Hz entre 3,3 e 4,4 s);
//  - a fala original do Jack (1000 Hz) continua inteira.
const { chromium, devices } = require("playwright");
const fs = require("fs");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");
const { entrarAdmin, esperarFila } = require("./auxiliar.cjs");
const BASE = process.argv[2] || "http://localhost:4174/";
const SERVIDOR = "http://localhost:54399";
const SAIDA = path.join(__dirname, "saida");
fs.mkdirSync(SAIDA, { recursive: true });
const VIDEO = path.join(SAIDA, "cena-vez.mp4");
const SRT = path.join(SAIDA, "cena-vez.srt");
const TOM = path.join(SAIDA, "microfone-600.wav");
const db = (arq, ini, dur, freq) => {
  const out = spawnSync("ffmpeg", ["-hide_banner", "-ss", String(ini), "-t", String(dur), "-i", arq, "-af", `pan=mono|c0=0.5*c0+0.5*c1,bandpass=f=${freq}:width_type=h:w=40,astats`, "-f", "null", "-"], { encoding: "utf8" }).stderr;
  const m = /RMS level dB: (-?[\d.]+|-inf)/.exec(out);
  return m ? (m[1] === "-inf" ? -120 : Number(m[1])) : -120;
};

(async () => {
  // Áudio original: "voz do Jack" = tom de 1000 Hz de 3,2 a 4,5 s; resto em silêncio.
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30", "-f", "lavfi", "-i",
    "sine=frequency=1000:sample_rate=48000,volume='if(between(t,3.2,4.5),0.3,0)':eval=frame", "-t", "7", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-ac", "2", "-shortest", VIDEO]);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=600:sample_rate=48000", "-af", "volume=0.3", "-t", "60", TOM]);
  fs.writeFileSync(SRT, "1\n00:00:02,000 --> 00:00:03,000\nOlá, Jack\n\n2\n00:00:03,200 --> 00:00:04,500\nOlá, Rose\n");

  const nav = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${TOM}`, "--autoplay-policy=no-user-gesture-required"] });
  const erros = [];
  const nova = async (o) => {
    const pg = await (await nav.newContext({ ...o, permissions: ["microphone"], acceptDownloads: true })).newPage();
    pg.on("pageerror", (e) => erros.push(String(e)));
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
  await adm.getByLabel("Título").fill("Cada um na sua vez");
  const nomes = adm.getByLabel("Nome do personagem");
  await nomes.nth(0).fill("Rose");
  await nomes.nth(1).fill("Jack");
  await adm.getByLabel("Personagem", { exact: true }).nth(1).selectOption({ label: "Jack" });
  await adm.getByRole("button", { name: /Salvar cena/ }).click();
  await adm.getByRole("heading", { name: "Administração" }).waitFor({ timeout: 60000 });
  await esperarFila(adm);
  const cenaId = (await (await fetch(`${SERVIDOR}/__estado`)).json()).cenas.find((c) => c.titulo === "Cada um na sua vez").id;

  const u = await nova({ ...devices["Pixel 7"] });
  await u.goto(BASE + "#/cena/" + cenaId);
  await u.getByRole("button", { name: /^Jack/ }).click(); // dubla só a Rose
  await u.getByRole("button", { name: /Entrar no estúdio/ }).click();
  await u.locator(".estudio").waitFor();
  await u.waitForFunction(() => document.querySelector("video")?.readyState >= 2);
  await u.getByRole("button", { name: "Gravar esta fala" }).click();
  await u.locator(".contagem", { hasText: "3" }).waitFor({ timeout: 3000 });
  const parado = await u.evaluate(() => document.querySelector("video").paused);
  await u.locator(".contagem", { hasText: "1" }).waitFor({ timeout: 3000 });
  console.log("Contagem 3, 2, 1 com a imagem parada antes de gravar:", parado ? "ok" : "FALHOU");
  await u.getByRole("link", { name: /Resultado 1\/1/ }).waitFor({ timeout: 30000 });
  await u.getByRole("link", { name: /Resultado 1\/1/ }).click();
  await u.waitForFunction(() => !document.querySelector(".controles .botao-verde")?.disabled);
  // Este teste confere a fala do Jack (personagem não dublado) inteira: desliga o "Só a minha voz".
  await u.getByLabel(/Só a minha voz/).uncheck();
  const dl = u.waitForEvent("download", { timeout: 90000 });
  await u.getByRole("button", { name: /Salvar na galeria/ }).click();
  const arq = path.join(SAIDA, "cada-um-na-vez.mp4");
  await (await dl).saveAs(arq);
  const rose = db(arq, 2.2, 0.6, 600), invasao = db(arq, 3.3, 1.1, 600), jack = db(arq, 3.4, 0.9, 1000);
  // Referência: o mesmo trecho no vídeo original (sem voz nenhuma da pessoa) — o filtro pega um pouquinho do tom do Jack.
  const base = db(VIDEO, 3.3, 1.1, 600);
  console.log(`Voz da pessoa na fala da Rose: ${rose.toFixed(1)} dB · na fala do Jack: ${invasao.toFixed(1)} dB (vídeo original sem a pessoa: ${base.toFixed(1)} dB) · Jack original: ${jack.toFixed(1)} dB`);
  console.log("A voz gravada fica só na fala da Rose (não entra na do Jack):", rose > -50 && invasao <= base + 2 && rose > invasao + 10 ? "ok" : "FALHOU");
  console.log("A fala do Jack continua inteira:", jack > -40 ? "ok" : "FALHOU");
  console.log(erros.length ? "ERROS:\n" + erros.join("\n") : "Sem erros no console.");
  await nav.close();
})().catch((e) => {
  console.error("FALHOU:", e);
  process.exit(1);
});
