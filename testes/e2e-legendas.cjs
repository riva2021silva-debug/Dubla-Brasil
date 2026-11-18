// Teste: o administrador corrige o texto de uma legenda (e o original) e o usuário vê a correção no estúdio.
const { chromium, devices } = require("playwright");
const path = require("path");
const { entrarAdmin, criarCenaTeste } = require("./auxiliar.cjs");
const BASE = process.argv[2] || "http://localhost:4174/";
const SERVIDOR = "http://localhost:54399";
const SAIDA = path.join(__dirname, "saida");

(async () => {
  const navegador = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
  const erros = [];
  const nova = async (o) => {
    const pg = await (await navegador.newContext({ ...o, permissions: ["microphone"] })).newPage();
    pg.on("pageerror", (e) => erros.push(String(e)));
    pg.on("console", (m) => m.type() === "error" && !/status of 4\d\d/.test(m.text()) && erros.push(m.text()));
    return pg;
  };
  const adm = await nova({ ...devices["Pixel 7"] });
  await entrarAdmin(adm, BASE);
  await criarCenaTeste(adm, "Cena da legenda");
  const cena = (await (await fetch(`${SERVIDOR}/__estado`)).json()).cenas.find((c) => c.titulo === "Cena da legenda");
  await adm.goto(BASE + "#/admin/cena/" + cena.id);
  await adm.getByText("Corrigir legenda:").waitFor();
  const primeira = adm.getByLabel("Texto da fala").first();
  await primeira.fill("Tucano, cadê o meu chinelo de estimação?");
  await adm.screenshot({ path: path.join(SAIDA, "l1-corrigir-legenda.png") });
  await adm.getByRole("button", { name: /Salvar cena/ }).click();
  await adm.getByRole("heading", { name: "Administração" }).waitFor({ timeout: 60000 });
  const salva = (await (await fetch(`${SERVIDOR}/__estado`)).json()).cenas.find((c) => c.id === cena.id);
  const texto = [...salva.falas].sort((a, b) => a.inicioMs - b.inicioMs)[0].texto;
  console.log("Legenda corrigida salva no servidor:", texto === "Tucano, cadê o meu chinelo de estimação?" ? "ok" : "FALHOU (" + texto + ")");

  const u = await nova({ ...devices["Pixel 7"] });
  await u.goto(BASE + "#/cena/" + cena.id);
  await u.getByRole("button", { name: /Entrar no estúdio/ }).click();
  await u.locator(".estudio").waitFor();
  await u.locator(".texto-fala", { hasText: "chinelo de estimação" }).waitFor();
  console.log("Usuário vê a legenda corrigida no estúdio: ok");
  console.log(erros.length ? "ERROS:\n" + erros.join("\n") : "Sem erros no console.");
  await navegador.close();
})().catch((e) => {
  console.error("FALHOU:", e);
  process.exit(1);
});
