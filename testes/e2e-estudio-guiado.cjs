// Teste do estúdio guiado (versão 3.9): Guia, aviso de microfone baixo e "Ficou bom · Próxima fala".
const { chromium, devices } = require("playwright");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { entrarAdmin, criarCenaTeste } = require("./auxiliar.cjs");
const BASE = process.argv[2] || "http://localhost:4174/";
const SERVIDOR = "http://localhost:54399";
const SAIDA = path.join(__dirname, "saida");
const SILENCIO = path.join(SAIDA, "microfone-silencio.wav");

(async () => {
  if (!fs.existsSync(SILENCIO)) execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono", "-t", "30", SILENCIO]);
  const navegador = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${SILENCIO}`, "--autoplay-policy=no-user-gesture-required"] });
  const erros = [];
  const nova = async (o) => {
    const pg = await (await navegador.newContext({ ...o, permissions: ["microphone"] })).newPage();
    pg.on("pageerror", (e) => erros.push(String(e)));
    pg.on("console", (m) => m.type() === "error" && !/status of 4\d\d/.test(m.text()) && erros.push(m.text()));
    return pg;
  };
  const adm = await nova({ viewport: { width: 1280, height: 900 } });
  await entrarAdmin(adm, BASE);
  await criarCenaTeste(adm, "Cena guiada");
  const cenaId = (await (await fetch(`${SERVIDOR}/__estado`)).json()).cenas.find((c) => c.titulo === "Cena guiada").id;

  const u = await nova({ ...devices["Pixel 7"] });
  await u.goto(BASE + "#/cena/" + cenaId);
  await u.getByRole("button", { name: /Entrar no estúdio/ }).click();
  await u.locator(".estudio").waitFor();
  await u.waitForFunction(() => document.querySelector("video")?.readyState >= 2);
  await u.getByRole("button", { name: "🔇 Guia" }).click();
  await u.getByRole("button", { name: "🔈 Guia" }).waitFor();
  await u.reload();
  await u.locator(".estudio").waitFor();
  await u.getByRole("button", { name: "🔈 Guia" }).waitFor();
  console.log("Guia liga e continua ligada ao voltar: ok");
  await u.waitForFunction(() => document.querySelector("video")?.readyState >= 2);
  await u.getByText("Fala 1 de 6").waitFor();
  await u.getByRole("button", { name: /Gravar esta fala/ }).click();
  await u.getByText("Não estou te ouvindo bem").waitFor({ timeout: 10000 });
  await u.screenshot({ path: path.join(SAIDA, "eg1-aviso-baixo.png") });
  console.log("Microfone mudo na hora de falar: aviso \"fale mais alto\": ok");
  await u.getByRole("button", { name: /Ficou bom · Próxima fala/ }).waitFor({ timeout: 15000 });
  await u.screenshot({ path: path.join(SAIDA, "eg2-ficou-bom.png") });
  await u.getByRole("button", { name: /Ficou bom · Próxima fala/ }).click();
  await u.getByText("Fala 2 de 6").waitFor();
  console.log("Depois de gravar, \"✅ Ficou bom · Próxima fala\" leva para a fala 2: ok");
  console.log(erros.length ? "ERROS:\n" + erros.join("\n") : "Sem erros no console.");
  await navegador.close();
})().catch((e) => {
  console.error("FALHOU:", e);
  process.exit(1);
});
