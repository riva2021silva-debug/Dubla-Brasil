// Versão 5.8: categorias na tela de Cenas (gênero e idioma), nota da dublagem em cada fala e no resultado,
// e a tela de Novidades.
const { chromium, devices } = require("playwright");
const path = require("path");
const { entrarAdmin, criarCenaTeste, esperarFila } = require("./auxiliar.cjs");
const BASE = process.argv[2] || "http://localhost:4174/";
const S = "http://localhost:54399";
const FIX = path.join(__dirname, "fixtures");
const ok = (c) => (c ? "ok" : "FALHOU");

(async () => {
  const nav = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
  const erros = [];
  const adm = await (await nav.newContext({ viewport: { width: 1280, height: 1000 } })).newPage();
  adm.on("pageerror", (e) => erros.push(String(e)));
  await entrarAdmin(adm, BASE);
  await criarCenaTeste(adm, "Cena de comédia");
  // Põe a categoria pelo Editor.
  const id = (await (await fetch(`${S}/__estado`)).json()).cenas.find((c) => c.titulo === "Cena de comédia").id;
  await adm.goto(BASE + "#/admin/cena/" + id);
  await adm.getByLabel("Categoria").selectOption("Comédia");
  await adm.getByRole("button", { name: /Salvar cena/ }).click();
  await adm.getByRole("heading", { name: "Administração" }).waitFor({ timeout: 60000 });
  await esperarFila(adm);
  // Segunda cena: Ação.
  await adm.getByRole("link", { name: /Adicionar vídeo/ }).first().click();
  const [v] = await Promise.all([adm.waitForEvent("filechooser"), adm.getByRole("button", { name: /Escolher o vídeo da cena/ }).click()]);
  await v.setFiles(path.join(FIX, "cena-teste", "video.mp4"));
  await adm.locator(".palco video").waitFor();
  const [s] = await Promise.all([adm.waitForEvent("filechooser"), adm.getByRole("button", { name: /Importar legendas/ }).click()]);
  await s.setFiles(path.join(FIX, "cena-teste.srt"));
  await adm.getByLabel("Título").fill("Cena de ação");
  await adm.getByLabel("Categoria").selectOption("Ação");
  await adm.getByRole("button", { name: /Salvar cena/ }).click();
  await adm.getByRole("heading", { name: "Administração" }).waitFor({ timeout: 60000 });
  await esperarFila(adm);
  const cenas = (await (await fetch(`${S}/__estado`)).json()).cenas;
  console.log("Categoria salva no servidor:", ok(cenas.find((c) => c.titulo === "Cena de comédia")?.genero === "Comédia" && cenas.find((c) => c.titulo === "Cena de ação")?.genero === "Ação"));

  // Quem usa o app: filtra por categoria.
  const u = await (await nav.newContext({ ...devices["Pixel 7"], permissions: ["microphone"] })).newPage();
  u.on("pageerror", (e) => erros.push(String(e)));
  await u.goto(BASE + "#/cenas");
  await u.locator(".filtro-categorias").waitFor();
  await u.locator(".filtro-categorias").getByRole("button", { name: /Comédia/ }).click();
  await u.getByText("Cena de comédia").waitFor();
  const soComedia = (await u.getByText("Cena de ação").count()) === 0;
  console.log("Filtro “Comédia” mostra só a cena de comédia:", ok(soComedia));
  await u.locator(".filtro-categorias").getByRole("button", { name: /Ação/ }).click();
  await u.getByText("Cena de ação").waitFor();
  console.log("Filtro “Ação” mostra a cena de ação:", ok((await u.getByText("Cena de comédia").count()) === 0));
  const largura = await u.evaluate(() => document.documentElement.scrollWidth);
  console.log(`Fileira de categorias não estoura a tela no celular (${largura}px):`, ok(largura <= 412));
  await u.screenshot({ path: path.join(__dirname, "saida", "categorias.png") });

  // Nota da dublagem.
  await u.locator(".filtro-categorias").getByRole("button", { name: "Todas" }).click();
  await u.getByText("Cena de comédia").click();
  await u.getByRole("button", { name: /Entrar no estúdio/ }).click();
  await u.locator(".estudio").waitFor();
  await u.waitForFunction(() => document.querySelector("video")?.readyState >= 2);
  await u.getByRole("button", { name: "Gravar esta fala" }).click();
  await u.locator(".nota-afinacao").waitFor({ timeout: 40000 });
  const nota = (await u.locator(".nota-afinacao").innerText()).replace(/\s+/g, " ");
  console.log(`Depois de gravar a fala aparece a nota (${nota}):`, ok(/Nota \d+%/.test(nota)));
  await u.getByRole("link", { name: /Resultado/ }).click();
  await u.getByText(/Nota da dublagem:/).waitFor();
  console.log("Resultado mostra a nota da dublagem: ok");

  // Novidades.
  await u.goto(BASE + "#/configuracoes");
  await u.getByRole("link", { name: /Novidades/ }).first().click();
  await u.getByRole("heading", { name: "🆕 Novidades" }).waitFor();
  console.log("Tela de Novidades abre pelas Configurações:", ok((await u.getByText("Versão 5.8").count()) === 1));
  console.log(erros.length ? "ERROS:\n" + erros.join("\n") : "Sem erros no console.");
  await nav.close();
})().catch((e) => {
  console.error("FALHOU:", e);
  process.exit(1);
});
