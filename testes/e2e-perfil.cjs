// Teste do perfil (versão 3.5): apelido e foto no "Meu perfil"; a foto aparece no vídeo da galeria e nos
// comentários no lugar da letra; trocar o apelido também muda na galeria.
const { chromium, devices } = require("playwright");
const path = require("path");
const { entrarAdmin, criarCenaTeste } = require("./auxiliar.cjs");
const BASE = process.argv[2] || "http://localhost:4174/";
const SERVIDOR = "http://localhost:54399";
const SAIDA = path.join(__dirname, "saida");
const FOTO = path.join(__dirname, "fixtures", "cena-teste", "capa.jpg");

(async () => {
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
  await criarCenaTeste(adm, "Cena do perfil");
  const cenaId = (await (await fetch(`${SERVIDOR}/__estado`)).json()).cenas.find((c) => c.titulo === "Cena do perfil").id;

  const u = await nova({ ...devices["Pixel 7"] });
  await u.goto(BASE + "#/configuracoes");
  await u.getByText("👤 Meu perfil e conta").click();
  await u.getByRole("heading", { name: "Meu perfil" }).waitFor();
  await u.locator("#apelido-perfil").fill("Rafa_Dubla");
  await u.getByRole("button", { name: "Salvar", exact: true }).click();
  await u.getByText("✅ Apelido salvo!").waitFor();
  const [arq] = await Promise.all([u.waitForEvent("filechooser"), u.getByRole("button", { name: /Colocar foto/ }).first().click()]);
  await arq.setFiles(FOTO);
  await u.getByText("✅ Foto do perfil atualizada!").waitFor({ timeout: 15000 });
  await u.waitForFunction(() => document.querySelector(".perfil-foto-botao img")?.complete && document.querySelector(".perfil-foto-botao img").naturalWidth === 320);
  await u.screenshot({ path: path.join(SAIDA, "p-meu-perfil.png") });
  console.log("Meu perfil: apelido salvo e foto (320×320) colocada: ok");

  // Publica um dub e confere a foto na galeria.
  await u.goto(BASE + "#/cena/" + cenaId);
  await u.getByRole("button", { name: /Entrar no estúdio/ }).click();
  await u.locator(".estudio").waitFor();
  await u.waitForFunction(() => document.querySelector("video")?.readyState >= 2);
  await u.getByRole("button", { name: /Gravar esta fala/ }).click();
  await u.getByRole("link", { name: /Resultado 1\// }).waitFor({ timeout: 30000 });
  await u.getByRole("link", { name: /Resultado 1\// }).click();
  await u.waitForFunction(() => !document.querySelector(".controles .botao-verde")?.disabled);
  await u.getByRole("button", { name: /Publicar na galeria/ }).click();
  await u.waitForURL(/#\/galeria\?p=/, { timeout: 120000 });
  await u.locator(".post").first().waitFor();
  await u.waitForFunction(() => document.querySelector(".post .post-autor img")?.naturalWidth > 0, null, { timeout: 15000 });
  console.log("Galeria: a foto do perfil aparece no vídeo no lugar da letra: ok");
  await u.getByLabel("Faça um comentário").first().fill("Ficou top!");
  await u.getByRole("button", { name: "Enviar comentário" }).first().click();
  await u.getByText("💬 Comentário enviado!").waitFor();
  await u.getByRole("button", { name: /^Comentários/ }).first().click();
  await u.waitForFunction(() => document.querySelector(".comentario .foto-perfil img")?.naturalWidth > 0);
  await u.screenshot({ path: path.join(SAIDA, "p-comentario-foto.png") });
  console.log("Comentários: a foto aparece ao lado do apelido: ok");
  await u.getByRole("button", { name: "Fechar" }).click();
  await u.screenshot({ path: path.join(SAIDA, "p-galeria-foto.png") });

  // Troca o apelido e confere na galeria.
  await u.goto(BASE + "#/conta");
  await u.locator("#apelido-perfil").fill("Rafa_Vozes");
  await u.getByRole("button", { name: "Salvar", exact: true }).click();
  await u.getByText("✅ Apelido salvo!").waitFor();
  await u.goto(BASE + "#/cenas");
  await u.goto(BASE + "#/galeria");
  await u.getByText("@Rafa_Vozes").first().waitFor();
  console.log("Trocar o apelido muda na galeria: ok");
  const estado = await (await fetch(`${SERVIDOR}/__estado`)).json();
  console.log(erros.length ? "ERROS:\n" + erros.join("\n") : "Sem erros no console.");
  await navegador.close();
})().catch((e) => {
  console.error("FALHOU:", e);
  process.exit(1);
});
