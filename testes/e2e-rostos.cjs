// Teste dos rostos automáticos: o administrador cadastra um vídeo com duas pessoas que se alternam;
// ao salvar, cada personagem deve ganhar a foto do próprio rosto. Depois confere a tela "Pronto para dublar?".
const { chromium, devices } = require("playwright");
const fs = require("fs");
const path = require("path");
const { entrarAdmin } = require("./auxiliar.cjs");
const BASE = process.argv[2] || "http://localhost:4174/";
const SERVIDOR = "http://localhost:54399";
const SAIDA = path.join(__dirname, "saida");
const FIX = path.join(__dirname, "fixtures", "cena-rostos");
fs.mkdirSync(SAIDA, { recursive: true });

(async () => {
  const navegador = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
  const ctx = await navegador.newContext({ viewport: { width: 1280, height: 900 }, permissions: ["microphone"] });
  const p = await ctx.newPage();
  const erros = [];
  p.on("pageerror", (e) => erros.push(String(e)));
  p.on("console", (m) => m.type() === "error" && erros.push(m.text()));

  await entrarAdmin(p, BASE);
  await p.getByRole("link", { name: /Adicionar vídeo/ }).first().click();
  const [v] = await Promise.all([p.waitForEvent("filechooser"), p.getByRole("button", { name: /Escolher o vídeo da cena/ }).click()]);
  await v.setFiles(path.join(FIX, "video.mp4"));
  await p.locator(".palco video").waitFor();
  const [s] = await Promise.all([p.waitForEvent("filechooser"), p.getByRole("button", { name: /Importar legendas/ }).click()]);
  await s.setFiles(path.join(FIX, "legendas.srt"));
  await p.getByRole("heading", { name: "Falas (4)" }).waitFor();
  await p.getByLabel("Título").fill("Conversa de teste");
  const nomes = p.getByLabel("Nome do personagem");
  await nomes.nth(0).fill("Ana");
  await nomes.nth(1).fill("Bruno");
  for (const i of [1, 3]) await p.getByLabel("Personagem", { exact: true }).nth(i).selectOption({ label: "Bruno" });

  // Rostos automáticos pelo botão (antes de salvar), para ver as prévias no editor.
  const t0 = Date.now();
  await p.getByRole("button", { name: /Rostos automáticos/ }).click();
  await p.locator(".personagem-editor .avatar img").nth(1).waitFor({ timeout: 60000 });
  console.log(`Rostos encontrados em ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  const aviso = await p.locator(".info", { hasText: "rosto" }).allInnerTexts();
  console.log("Aviso:", aviso.length ? aviso.join(" ") : "(nenhum: os dois rostos foram achados)");
  await p.locator("section", { hasText: "Personagens" }).last().screenshot({ path: path.join(SAIDA, "f0-editor-rostos.png") });

  await p.getByRole("button", { name: /Salvar cena/ }).click();
  await p.getByRole("heading", { name: "Administração" }).waitFor({ timeout: 60000 });
  const estado = await (await fetch(`${SERVIDOR}/__estado`)).json();
  const cena = estado.cenas.find((c) => c.titulo === "Conversa de teste");
  console.log("Fotos salvas no servidor:", cena.personagens.map((x) => `${x.nome} → ${x.fotoPath ? "ok" : "SEM FOTO"}`).join(", "));
  for (const x of cena.personagens) {
    const r = await fetch(`${SERVIDOR}/storage/v1/object/public/midias/${x.fotoPath}`);
    fs.writeFileSync(path.join(SAIDA, `f-rosto-${x.nome}.jpg`), Buffer.from(await r.arrayBuffer()));
  }

  // Tela "Pronto para dublar?" no celular.
  const cel = await navegador.newContext({ ...devices["Pixel 7"], permissions: ["microphone"] });
  const q = await cel.newPage();
  q.on("pageerror", (e) => erros.push(String(e)));
  await q.goto(BASE + "#/cena/" + cena.id);
  await q.getByText("Pronto para").waitFor();
  await q.locator(".ator .avatar img").nth(1).waitFor();
  await q.waitForFunction(() => [...document.querySelectorAll(".ator .avatar img")].every((i) => i.complete && i.naturalWidth > 0));
  // Com a permissão já dada, o medidor liga sozinho; senão, aparece o botão "Ligar o microfone".
  const ligar = q.getByRole("button", { name: "Ligar o microfone" });
  const gravar3 = q.getByRole("button", { name: /Gravar 3 s e ouvir/ });
  await Promise.race([ligar.waitFor(), gravar3.waitFor()]);
  if (await ligar.isVisible()) await ligar.click();
  await q.getByText("Som detectado").waitFor({ timeout: 10000 }).catch(() => {});
  await q.waitForTimeout(600);
  await q.screenshot({ path: path.join(SAIDA, "f1-pronto.png") });
  await q.getByRole("button", { name: /^Bruno/ }).click();
  await q.getByText("Você dubla: Ana").waitFor();
  await q.getByRole("button", { name: /Gravar 3 s e ouvir/ }).click();
  await q.getByText("Ouvindo…").waitFor({ timeout: 8000 });
  console.log("Teste do microfone (gravar e ouvir): ok");
  await q.getByRole("button", { name: /Entrar no estúdio/ }).click();
  await q.locator(".estudio").waitFor();
  await q.locator(".cartao-fala .avatar img").waitFor();
  await q.screenshot({ path: path.join(SAIDA, "f2-estudio.png") });
  console.log("Estúdio abriu com a foto da Ana: ok");
  console.log("Largura da página:", await q.evaluate(() => document.documentElement.scrollWidth));

  console.log(erros.length ? "ERROS:\n" + erros.join("\n") : "Sem erros no console.");
  await navegador.close();
})().catch((e) => {
  console.error("FALHOU:", e);
  process.exit(1);
});
