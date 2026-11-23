// Teste do rascunho do editor (versão 3.0): o administrador começa um vídeo novo, sai e o app é recarregado
// (como se o celular tivesse fechado o app); ao voltar, "Retomar edição" traz tudo de volta, inclusive o vídeo.
const { chromium, devices } = require("playwright");
const path = require("path");
const { entrarAdmin, esperarFila } = require("./auxiliar.cjs");
const BASE = process.argv[2] || "http://localhost:4174/";
const SERVIDOR = "http://localhost:54399";
const SAIDA = path.join(__dirname, "saida");
const FIX = path.join(__dirname, "fixtures");

(async () => {
  const navegador = await chromium.launch();
  const erros = [];
  const p = await (await navegador.newContext({ ...devices["Pixel 7"] })).newPage();
  p.on("pageerror", (e) => erros.push(String(e)));
  p.on("console", (m) => m.type() === "error" && !/status of 4\d\d/.test(m.text()) && erros.push(m.text()));
  p.on("dialog", (d) => d.accept()); // aviso do navegador ao sair com alterações

  await entrarAdmin(p, BASE);
  await p.getByRole("link", { name: /Adicionar vídeo/ }).first().click();
  const [v] = await Promise.all([p.waitForEvent("filechooser"), p.getByRole("button", { name: /Escolher o vídeo da cena/ }).click()]);
  await v.setFiles(path.join(FIX, "cena-teste", "video.mp4"));
  await p.locator(".palco video").waitFor();
  const [s] = await Promise.all([p.waitForEvent("filechooser"), p.getByRole("button", { name: /Importar legendas/ }).click()]);
  await s.setFiles(path.join(FIX, "cena-teste.srt"));
  await p.getByRole("heading", { name: "Falas (6)" }).waitFor();
  await p.getByLabel("Título").fill("Rascunho do chinelo");
  await p.getByLabel("Texto da fala").first().fill("Fala corrigida antes de sair");
  await p.getByText(/Rascunho salvo no aparelho/).waitFor({ timeout: 10000 });
  console.log("Rascunho salvo sozinho enquanto edita: ok");

  // Sai e "o app fecha": recarrega a página do zero.
  await p.goto(BASE + "#/cenas");
  await p.reload();
  await p.goto(BASE + "#/admin");
  await p.getByText("📝 Vídeo novo em edição").waitFor({ timeout: 10000 });
  await p.getByText(/“Rascunho do chinelo”/).waitFor();
  await p.screenshot({ path: path.join(SAIDA, "r1-aviso-admin.png") });
  console.log("Administração avisa: Vídeo novo em edição: ok");
  await p.getByRole("link", { name: /Retomar edição/ }).click();
  await p.getByRole("heading", { name: "Falas (6)" }).waitFor({ timeout: 15000 });
  await p.waitForFunction(() => document.querySelector(".palco video")?.readyState >= 1);
  const titulo = await p.getByLabel("Título").inputValue();
  const fala = await p.getByLabel("Texto da fala").first().inputValue();
  console.log(`Retomou com vídeo, título "${titulo}" e a fala "${fala}":`, titulo === "Rascunho do chinelo" && fala === "Fala corrigida antes de sair" ? "ok" : "FALHOU");
  await p.screenshot({ path: path.join(SAIDA, "r2-retomado.png") });

  // Salva de verdade: o rascunho some.
  await p.getByRole("button", { name: /Salvar cena/ }).click();
  await p.getByRole("heading", { name: "Administração" }).waitFor({ timeout: 60000 });
  await esperarFila(p);
  await p.waitForTimeout(1000);
  const sobrou = await p.getByText("📝 Vídeo novo em edição").count();
  const cena = (await (await fetch(`${SERVIDOR}/__estado`)).json()).cenas.find((c) => c.titulo === "Rascunho do chinelo");
  console.log("Depois de salvar: cena no servidor e rascunho apagado:", cena && !sobrou ? "ok" : "FALHOU");

  // Cena existente: muda o título, recarrega, aparece "edição não salva"; Descartar volta ao salvo.
  await p.goto(BASE + "#/admin/cena/" + cena.id);
  await p.getByLabel("Título").fill("Título que não foi salvo");
  await p.getByText(/Rascunho salvo no aparelho/).waitFor({ timeout: 10000 });
  await p.reload();
  await p.getByText("📝 Você tem uma edição não salva").waitFor({ timeout: 10000 });
  await p.screenshot({ path: path.join(SAIDA, "r3-aviso-editor.png") });
  await p.getByRole("button", { name: "Descartar" }).click();
  await p.getByText("📝 Você tem uma edição não salva").waitFor({ state: "detached" });
  const depois = await p.getByLabel("Título").inputValue();
  await p.reload();
  await p.getByLabel("Título").waitFor();
  await p.waitForTimeout(1200);
  const avisoDeNovo = await p.getByText("📝 Você tem uma edição não salva").count();
  console.log(`Cena existente: aviso no editor e "Descartar" mantém o salvo ("${depois}"):`, depois === "Rascunho do chinelo" && !avisoDeNovo ? "ok" : "FALHOU");
  console.log(erros.length ? "ERROS:\n" + erros.join("\n") : "Sem erros no console.");
  await navegador.close();
})().catch((e) => {
  console.error("FALHOU:", e);
  process.exit(1);
});
