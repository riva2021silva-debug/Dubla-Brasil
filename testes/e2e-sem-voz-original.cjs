// "🔇 Tirar todas as vozes originais" (versão 5.4): uma voz original numa parte SEM fala marcada (0,3–1,5 s, 1000 Hz)
// aparece no vídeo final com a chave desligada e some com a chave ligada (fica só a voz da pessoa).
const { chromium, devices } = require("playwright");
const fs = require("fs");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");
const { entrarAdmin } = require("./auxiliar.cjs");
const BASE = process.argv[2] || "http://localhost:4174/";
const S = "http://localhost:54399";
const SAIDA = path.join(__dirname, "saida");
fs.mkdirSync(SAIDA, { recursive: true });
const VIDEO = path.join(SAIDA, "cena-voz-solta.mp4"), SRT = path.join(SAIDA, "cena-voz-solta.srt"), TOM = path.join(SAIDA, "mic-600-b.wav");
const db = (arq, ini, dur, f) => { const o = spawnSync("ffmpeg", ["-hide_banner", "-ss", String(ini), "-t", String(dur), "-i", arq, "-af", `pan=mono|c0=0.5*c0+0.5*c1,bandpass=f=${f}:width_type=h:w=40,astats`, "-f", "null", "-"], { encoding: "utf8" }).stderr; const m = /RMS level dB: (-?[\d.]+|-inf)/.exec(o); return m ? (m[1] === "-inf" ? -120 : Number(m[1])) : -120; };
(async () => {
  // "Voz" original (1000 Hz, igual nos dois lados = no centro) de 0,3 a 1,5 s, onde NÃO há fala marcada.
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30", "-f", "lavfi", "-i",
    "sine=frequency=1000:sample_rate=48000,volume='if(between(t,0.3,1.5),0.3,0)':eval=frame", "-t", "7", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-ac", "2", "-shortest", VIDEO]);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=600:sample_rate=48000", "-af", "volume=0.3", "-t", "60", TOM]);
  fs.writeFileSync(SRT, "1\n00:00:03,000 --> 00:00:05,000\nMinha fala\n");
  const nav = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${TOM}`, "--autoplay-policy=no-user-gesture-required"] });
  const adm = await (await nav.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await entrarAdmin(adm, BASE);
  await adm.getByRole("link", { name: /Adicionar vídeo/ }).first().click();
  const [v] = await Promise.all([adm.waitForEvent("filechooser"), adm.getByRole("button", { name: /Escolher o vídeo da cena/ }).click()]);
  await v.setFiles(VIDEO);
  await adm.locator(".palco video").waitFor();
  const [s] = await Promise.all([adm.waitForEvent("filechooser"), adm.getByRole("button", { name: /Importar legendas/ }).click()]);
  await s.setFiles(SRT);
  await adm.getByLabel("Título").fill("Voz solta");
  await adm.getByRole("button", { name: /Salvar cena/ }).click();
  await adm.getByRole("heading", { name: "Administração" }).waitFor({ timeout: 120000 });
  const cena = (await (await fetch(`${S}/__estado`)).json()).cenas[0];
  const u = await (await nav.newContext({ ...devices["Pixel 7"], permissions: ["microphone"], acceptDownloads: true })).newPage();
  await u.goto(BASE + "#/cena/" + cena.id);
  await u.getByRole("button", { name: /Entrar no estúdio/ }).click();
  await u.locator(".estudio").waitFor();
  await u.waitForFunction(() => document.querySelector("video")?.readyState >= 2);
  await u.getByRole("button", { name: "Gravar esta fala" }).click();
  await u.getByRole("link", { name: /Resultado 1\/1/ }).waitFor({ timeout: 40000 });
  await u.getByRole("link", { name: /Resultado 1\/1/ }).click();
  await u.waitForFunction(() => !document.querySelector(".controles .botao-verde")?.disabled);
  const exportar = async (nome) => {
    const dl = u.waitForEvent("download", { timeout: 90000 });
    await u.getByRole("button", { name: /Salvar na galeria/ }).click();
    const arq = path.join(SAIDA, nome);
    await (await dl).saveAs(arq);
    await u.waitForFunction(() => !document.querySelector(".controles .botao-verde")?.disabled);
    return arq;
  };
  // Cena com um personagem só, todo dublado: a chave já vem ligada.
  const ligada = await u.getByLabel(/Só a minha voz/).isChecked();
  console.log("Dublou todos os personagens: “Só a minha voz” já vem ligado:", ligada ? "ok" : "FALHOU");
  const comChave = await exportar("sem-voz-ligado.mp4");
  await u.getByLabel(/Só a minha voz/).uncheck();
  const semChave = await exportar("sem-voz-desligado.mp4");
  const vozSoltaLigado = db(comChave, 0.5, 0.8, 1000), vozSoltaDesligado = db(semChave, 0.5, 0.8, 1000), minhaVoz = db(comChave, 3.3, 1.4, 600);
  console.log(`Voz original na parte sem fala marcada: chave ligada ${vozSoltaLigado.toFixed(1)} dB · desligada ${vozSoltaDesligado.toFixed(1)} dB · sua voz ${minhaVoz.toFixed(1)} dB`);
  console.log("Com a chave ligada a voz original some do vídeo inteiro e fica a sua voz:", vozSoltaLigado < vozSoltaDesligado - 25 && minhaVoz > -50 ? "ok" : "FALHOU");
  await nav.close();
})().catch((e) => { console.error("FALHOU:", e); process.exit(1); });
