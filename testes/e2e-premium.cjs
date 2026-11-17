// Teste do Premium (versão 2.2): 3 dublagens grátis por dia, tela do Premium, criação de conta,
// liberação pelo administrador e vídeo do assinante sem marca d'água.
const { chromium, devices } = require("playwright");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { entrarAdmin, criarCenaTeste } = require("./auxiliar.cjs");
const BASE = process.argv[2] || "http://localhost:4174/";
const SERVIDOR = "http://localhost:54399";
const SAIDA = path.join(__dirname, "saida");
const ORIGINAL = path.join(__dirname, "fixtures", "cena-teste", "video.mp4");
fs.mkdirSync(SAIDA, { recursive: true });

function diferencaNoCantoDeBaixo(video) {
  const canto = (arq) =>
    execFileSync("ffmpeg", ["-v", "error", "-ss", "5", "-i", arq, "-frames:v", "1", "-vf", "scale=320:180,crop=70:40:245:135,format=gray", "-f", "rawvideo", "-"]);
  const a = canto(video), b = canto(ORIGINAL);
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
}

(async () => {
  const navegador = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
  const erros = [];
  const nova = async (o) => {
    const pg = await (await navegador.newContext({ ...o, permissions: ["microphone"], acceptDownloads: true })).newPage();
    pg.on("pageerror", (e) => erros.push(String(e)));
    pg.on("console", (m) => m.type() === "error" && !/status of 4\d\d/.test(m.text()) && erros.push(m.text()));
    return pg;
  };
  const adm = await nova({ viewport: { width: 1280, height: 900 } });
  await entrarAdmin(adm, BASE);
  await criarCenaTeste(adm, "Cena do Premium");
  const cenaId = (await (await fetch(`${SERVIDOR}/__estado`)).json()).cenas.find((c) => c.titulo === "Cena do Premium").id;

  const u = await nova({ ...devices["Pixel 7"] });
  const entrarNoEstudio = async () => {
    await u.goto(BASE + "#/cena/" + cenaId);
    await u.getByRole("button", { name: /Entrar no estúdio/ }).click();
  };
  for (let i = 1; i <= 3; i++) {
    await u.goto(BASE + "#/cena/" + cenaId);
    await u.getByText(`${4 - i} de 3 dublagens grátis hoje`).waitFor();
    await u.getByRole("button", { name: /Entrar no estúdio/ }).click();
    await u.locator(".estudio").waitFor();
  }
  console.log("3 dublagens grátis com contador (3, 2, 1 restantes): ok");
  await entrarNoEstudio();
  await u.getByRole("heading", { name: "Suas 3 dublagens grátis de hoje acabaram" }).waitFor();
  await u.screenshot({ path: path.join(SAIDA, "p1-limite.png") });
  console.log("4ª dublagem bloqueada com o aviso do Premium: ok");
  await u.getByRole("link", { name: /Seja Premium/ }).last().click();
  await u.getByRole("heading", { name: "Dubla Brasil Premium" }).waitFor();
  await u.screenshot({ path: path.join(SAIDA, "p2-premium.png") });
  await u.getByRole("button", { name: /Assinar por R\$ 19,90/ }).click();
  await u.getByText("Crie sua conta (ou entre) para assinar").waitFor();
  await u.locator("#conta-email").fill("maria@teste.dev");
  await u.locator("#conta-senha").fill("senha123");
  await u.getByRole("button", { name: "Criar conta", exact: true }).last().click();
  await u.getByRole("heading", { name: "Dubla Brasil Premium" }).waitFor();
  await u.getByRole("button", { name: /Assinar por/ }).click();
  await u.getByText("O pagamento ainda está sendo configurado").waitFor();
  console.log("Assinar pede conta, cria a conta e volta ao Premium (pagamento ainda sem link): ok");

  await adm.goto(BASE + "#/admin");
  await adm.getByRole("tab", { name: /Assinantes/ }).click();
  await adm.getByText("Nenhum assinante ainda.").waitFor();
  await adm.locator("#busca-assinante").fill("maria@teste.dev");
  await adm.getByRole("button", { name: /Dar 30 dias/ }).click();
  await adm.getByText(/maria@teste.dev é Premium até/).waitFor();
  await adm.getByText("1 assinante ativo").waitFor();
  await adm.screenshot({ path: path.join(SAIDA, "p3-admin-assinantes.png") });
  console.log("Admin liberou 30 dias pelo e-mail: ok");

  await u.goto(BASE + "#/conta");
  await u.reload();
  await u.getByText("⭐ Plano Premium").waitFor();
  await u.screenshot({ path: path.join(SAIDA, "p4-conta-premium.png") });
  for (let i = 0; i < 4; i++) {
    await entrarNoEstudio();
    await u.locator(".estudio").waitFor();
  }
  console.log("Assinante entra no estúdio sem limite (4 vezes seguidas): ok");
  await u.waitForFunction(() => document.querySelector("video")?.readyState >= 2);
  await u.getByText("Mais opções").click();
  await u.getByRole("button", { name: /Gravar todas seguidas/ }).click();
  await u.getByRole("link", { name: /Resultado 6\/6/ }).waitFor({ timeout: 40000 });
  await u.getByRole("link", { name: /Resultado 6\/6/ }).click();
  await u.waitForFunction(() => !document.querySelector(".controles .botao-verde")?.disabled);
  const semAviso = (await u.getByText("O vídeo sai com a marca d'água").count()) === 0;
  const download = u.waitForEvent("download", { timeout: 90000 });
  await u.getByRole("button", { name: /Salvar na galeria/ }).click();
  const d = await download;
  const video = path.join(SAIDA, "p-" + d.suggestedFilename());
  await d.saveAs(video);
  const dif = diferencaNoCantoDeBaixo(video);
  console.log(`Vídeo do assinante sem marca d'água (canto de baixo igual ao original: diferença ${dif.toFixed(1)}; aviso escondido: ${semAviso}):`, dif < 10 && semAviso ? "ok" : "FALHOU");
  console.log(erros.length ? "ERROS:\n" + erros.join("\n") : "Sem erros no console.");
  await navegador.close();
})().catch((e) => {
  console.error("FALHOU:", e);
  process.exit(1);
});
