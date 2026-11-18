// Teste do som ambiente (versão 3.3): sem trilha de fundo, na fala do usuário a voz original (centro) some
// e a música (lados) continua. Vídeo de teste: "voz" = 880 Hz no centro; "música" = 330 Hz só na esquerda.
const { chromium, devices } = require("playwright");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { entrarAdmin } = require("./auxiliar.cjs");
const BASE = process.argv[2] || "http://localhost:4174/";
const SERVIDOR = "http://localhost:54399";
const SAIDA = path.join(__dirname, "saida");
fs.mkdirSync(SAIDA, { recursive: true });
const VIDEO = path.join(SAIDA, "cena-ambiente.mp4");
const SRT = path.join(SAIDA, "cena-ambiente.srt");
const SILENCIO = path.join(SAIDA, "microfone-silencio.wav");

/** Nível (dB) de uma frequência num trecho do arquivo. */
function nivel(arq, ini, dur, freq) {
  const r = execFileSync("ffmpeg", ["-v", "error", "-ss", String(ini), "-t", String(dur), "-i", arq, "-af", `pan=mono|c0=0.5*c0+0.5*c1,bandpass=f=${freq}:width_type=h:w=30,astats=metadata=0:reset=0`, "-f", "null", "-"], { stdio: ["ignore", "pipe", "pipe"] });
  return r;
}
function db(arq, ini, dur, freq) {
  const out = require("child_process").spawnSync("ffmpeg", ["-hide_banner", "-ss", String(ini), "-t", String(dur), "-i", arq, "-af", `pan=mono|c0=0.5*c0+0.5*c1,bandpass=f=${freq}:width_type=h:w=30,astats`, "-f", "null", "-"], { encoding: "utf8" }).stderr;
  const m = /RMS level dB: (-?[\d.]+|-inf)/.exec(out);
  return m ? (m[1] === "-inf" ? -120 : Number(m[1])) : -120;
}

(async () => {
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30", "-f", "lavfi", "-i",
    "aevalsrc=0.3*sin(2*PI*330*t)+0.3*sin(2*PI*880*t)|0.3*sin(2*PI*880*t):s=48000:c=stereo", "-t", "12", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-shortest", VIDEO]);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono", "-t", "30", SILENCIO]);
  fs.writeFileSync(SRT, "1\n00:00:04,000 --> 00:00:08,000\nFala do teste de ambiente.\n");

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
  await adm.getByRole("heading", { name: "Falas (1)" }).waitFor();
  await adm.getByLabel("Título").fill("Cena do ambiente");
  await adm.getByRole("button", { name: /Salvar cena/ }).click();
  await adm.getByRole("heading", { name: "Administração" }).waitFor({ timeout: 60000 });
  const cenaId = (await (await fetch(`${SERVIDOR}/__estado`)).json()).cenas.find((c) => c.titulo === "Cena do ambiente").id;

  const u = await nova({ ...devices["Pixel 7"] });
  const gravarEBaixar = async (rotulo) => {
    await u.goto(BASE + "#/cena/" + cenaId);
    await u.getByRole("button", { name: /Entrar no estúdio/ }).click();
    await u.locator(".estudio").waitFor();
    await u.waitForFunction(() => document.querySelector("video")?.readyState >= 2);
    await u.getByRole("button", { name: /Gravar esta fala|Regravar esta fala/ }).click();
    await u.getByRole("link", { name: /Resultado 1\/1/ }).waitFor({ timeout: 30000 });
    await u.getByRole("link", { name: /Resultado 1\/1/ }).click();
    await u.waitForFunction(() => !document.querySelector(".controles .botao-verde")?.disabled);
    const dl = u.waitForEvent("download", { timeout: 90000 });
    await u.getByRole("button", { name: /Salvar na galeria/ }).click();
    const arq = path.join(SAIDA, `ambiente-${rotulo}.mp4`);
    await (await dl).saveAs(arq);
    return arq;
  };
  const ligado = await gravarEBaixar("ligado");
  const voz = db(ligado, 5, 2, 880), musica = db(ligado, 5, 2, 330), musicaFora = db(ligado, 1, 2, 330), vozFora = db(ligado, 1, 2, 880);
  console.log(`Ligado — fora da fala: voz ${vozFora.toFixed(0)} dB, música ${musicaFora.toFixed(0)} dB · na fala: voz ${voz.toFixed(0)} dB, música ${musica.toFixed(0)} dB`);
  console.log("Na fala do usuário a voz original some e a música continua:", voz < vozFora - 25 && musica > musicaFora - 10 ? "ok" : "FALHOU");

  await u.goto(BASE + "#/configuracoes");
  await u.getByText("Manter o som ambiente nas minhas falas").click();
  const desligado = await gravarEBaixar("desligado");
  const musicaDesl = db(desligado, 5, 2, 330);
  console.log(`Desligado nas Configurações — música na fala: ${musicaDesl.toFixed(0)} dB (como antes: silêncio):`, musicaDesl < musica - 25 ? "ok" : "FALHOU");
  console.log(erros.length ? "ERROS:\n" + erros.join("\n") : "Sem erros no console.");
  await navegador.close();
})().catch((e) => {
  console.error("FALHOU:", e);
  process.exit(1);
});
