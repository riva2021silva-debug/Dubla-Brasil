// Teste "sem eco" (versão 3.6): duas falas a 0,2 s uma da outra, gravadas seguidas com um tom constante no microfone.
// As sobras de antes/depois de cada tomada não podem se sobrepor (senão o mesmo trecho toca 2 vezes = eco/dobra).
const { chromium, devices } = require("playwright");
const fs = require("fs");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");
const { entrarAdmin, esperarFila } = require("./auxiliar.cjs");
const BASE = process.argv[2] || "http://localhost:4174/";
const SERVIDOR = "http://localhost:54399";
const SAIDA = path.join(__dirname, "saida");
fs.mkdirSync(SAIDA, { recursive: true });
const VIDEO = path.join(SAIDA, "cena-perto.mp4");
const SRT = path.join(SAIDA, "cena-perto.srt");
const TOM = path.join(SAIDA, "microfone-tom.wav");
const db = (arq, ini, dur, freq) => {
  const out = spawnSync("ffmpeg", ["-hide_banner", "-ss", String(ini), "-t", String(dur), "-i", arq, "-af", `pan=mono|c0=0.5*c0+0.5*c1,bandpass=f=${freq}:width_type=h:w=40,astats`, "-f", "null", "-"], { encoding: "utf8" }).stderr;
  const m = /RMS level dB: (-?[\d.]+|-inf)/.exec(out);
  return m ? (m[1] === "-inf" ? -120 : Number(m[1])) : -120;
};

(async () => {
  // Vídeo sem som (só a imagem) e microfone com um tom de 600 Hz constante.
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", "8", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", VIDEO]);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=600:sample_rate=48000", "-af", "volume=0.3", "-t", "60", TOM]);
  fs.writeFileSync(SRT, "1\n00:00:02,000 --> 00:00:03,000\nOi!\n\n2\n00:00:03,200 --> 00:00:04,500\nTudo bem?\n");

  const navegador = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${TOM}`, "--autoplay-policy=no-user-gesture-required"] });
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
  await adm.getByLabel("Título").fill("Cena das falas perto");
  await adm.getByRole("button", { name: /Salvar cena/ }).click();
  await adm.getByRole("heading", { name: "Administração" }).waitFor({ timeout: 60000 });
  await esperarFila(adm);
  const cenaId = (await (await fetch(`${SERVIDOR}/__estado`)).json()).cenas.find((c) => c.titulo === "Cena das falas perto").id;

  const u = await nova({ ...devices["Pixel 7"] });
  await u.goto(BASE + "#/configuracoes");
  // Sem o alinhamento automático, as duas tomadas ficam no mesmo tempo: sobreposição = som dobrado (+6 dB).
  await u.goto(BASE + "#/cena/" + cenaId);
  await u.getByRole("button", { name: /Entrar no estúdio/ }).click();
  await u.locator(".estudio").waitFor();
  await u.waitForFunction(() => document.querySelector("video")?.readyState >= 2);
  await u.getByText("Mais opções").click();
  await u.getByRole("button", { name: /Gravar todas seguidas/ }).click();
  await u.getByRole("link", { name: /Resultado 2\/2/ }).waitFor({ timeout: 40000 });
  await u.getByRole("link", { name: /Resultado 2\/2/ }).click();
  await u.waitForFunction(() => !document.querySelector(".controles .botao-verde")?.disabled);
  const dl = u.waitForEvent("download", { timeout: 90000 });
  await u.getByRole("button", { name: /Salvar na galeria/ }).click();
  const arq = path.join(SAIDA, "sem-eco.mp4");
  await (await dl).saveAs(arq);
  const meio1 = db(arq, 2.3, 0.4, 600), juncao = db(arq, 3.0, 0.3, 600), meio2 = db(arq, 3.7, 0.4, 600);
  console.log(`Nível da voz: meio da fala 1 ${meio1.toFixed(1)} dB · junção das falas ${juncao.toFixed(1)} dB · meio da fala 2 ${meio2.toFixed(1)} dB`);
  console.log("Na junção a voz não dobra (sem eco):", juncao < Math.max(meio1, meio2) + 2 && juncao > -60 ? "ok" : "FALHOU");
  console.log(erros.length ? "ERROS:\n" + erros.join("\n") : "Sem erros no console.");
  await navegador.close();
})().catch((e) => {
  console.error("FALHOU:", e);
  process.exit(1);
});
