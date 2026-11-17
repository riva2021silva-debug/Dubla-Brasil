// Teste do Modo Imitação e do jogo Voz no Alvo, com um microfone simulado que canta uma melodia.
const { chromium, devices } = require("playwright");
const path = require("path");
const fs = require("fs");
const { entrarAdmin } = require("./auxiliar.cjs");
const BASE = process.argv[2] || "http://localhost:4173/";
const SAIDA = path.join(__dirname, "saida");
const FIX = path.join(__dirname, "fixtures");
fs.mkdirSync(SAIDA, { recursive: true });

(async () => {
  const navegador = await chromium.launch({
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-audio-capture=${path.join(FIX, "microfone-cantando.wav")}`,
      "--autoplay-policy=no-user-gesture-required",
    ],
  });
  const ctx = await navegador.newContext({ ...devices["Pixel 7"], permissions: ["microphone"] });
  const p = await ctx.newPage();
  const erros = [];
  p.on("pageerror", (e) => erros.push(String(e)));
  p.on("console", (m) => m.type() === "error" && erros.push(m.text()));
  const foto = (n) => p.screenshot({ path: path.join(SAIDA, n + ".png") });

  // Admin cadastra um som.
  await entrarAdmin(p, BASE);
  await p.getByRole("tab", { name: /Sons da Imitação/ }).click();
  await p.getByRole("button", { name: "+ Adicionar som" }).click();
  const [arq] = await Promise.all([p.waitForEvent("filechooser"), p.getByRole("button", { name: "Escolher arquivo" }).click()]);
  await arq.setFiles(path.join(FIX, "som-teste.m4a"));
  await p.locator("#som-emoji").fill("🚀");
  await p.locator("#som-titulo").fill("Foguete subindo");
  await p.locator("#som-categoria").selectOption("Efeitos");
  await p.getByRole("button", { name: /Salvar som/ }).click();
  await p.getByText("Foguete subindo").waitFor();
  await foto("i0-admin-sons");
  console.log("Som cadastrado pelo admin: ok");

  // Usuário imita.
  await p.goto(BASE + "#/imitar");
  await p.getByText("Foguete subindo").click();
  await p.getByRole("button", { name: "Ouvir o original" }).waitFor();
  await foto("i1-imitar");
  await p.getByRole("button", { name: "Gravar a minha imitação" }).click();
  await p.locator(".contagem-imitar").waitFor();
  await p.waitForTimeout(3600);
  await foto("i2-gravando");
  await p.locator(".nota-grande").waitFor({ timeout: 15000 });
  const nota = await p.locator(".nota-grande").innerText();
  await foto("i3-nota");
  console.log("Nota recebida:", nota, "-", await p.locator(".rotulo-nota").innerText());
  await p.getByRole("button", { name: "Ouvir a minha versão" }).click();
  await p.goto(BASE + "#/imitar");
  await p.getByText(/Melhor nota: \d+/).waitFor();
  console.log("Melhor nota salva na lista: ok");

  // Jogo: calibração simulada já salva, então joga.
  await p.goto(BASE + "#/jogos");
  await foto("j0-jogos");
  await p.evaluate(() => localStorage.setItem("dubla-brasil:faixa-voz", JSON.stringify({ grave: 160, agudo: 380 })));
  await p.getByText("Voz no Alvo").click();
  await p.getByRole("button", { name: "Usar a calibração anterior" }).click();
  await p.getByRole("button", { name: "▶ Jogar" }).click();
  await p.waitForTimeout(4000);
  await foto("j1-jogando");
  const nota2 = await p.locator(".nota-voz").innerText().catch(() => "(sem nota no momento)");
  console.log("Jogo rodando; nota ouvida:", nota2);
  await p.locator(".titulo-cal", { hasText: "Fim de jogo" }).waitFor({ timeout: 60000 }).then(
    async () => console.log("Fim de jogo com", await p.locator(".sobreposicao .nota-grande").innerText(), "pontos"),
    async () => {
      await p.getByRole("button", { name: "■ Parar" }).click();
      console.log("Jogo parado manualmente após 60 s");
    },
  );
  await foto("j2-fim");
  const larguras = await p.evaluate(() => document.documentElement.scrollWidth);
  console.log("Largura da página no celular:", larguras);
  console.log(erros.length ? "ERROS:\n" + erros.join("\n") : "Sem erros no console.");
  await navegador.close();
})().catch((e) => {
  console.error("FALHOU:", e);
  process.exit(1);
});
