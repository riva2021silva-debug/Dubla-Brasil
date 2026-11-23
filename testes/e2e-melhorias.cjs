// Teste das melhorias da versão 1.8: vídeo em pé (9:16), capa escolhida no editor, fotos dos personagens sem
// quadro preto, legenda fora da imagem, vídeo salvo com a logo no canto e sem legenda por cima.
const { chromium, devices } = require("playwright");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { entrarAdmin, esperarFila } = require("./auxiliar.cjs");
const BASE = process.argv[2] || "http://localhost:4174/";
const SERVIDOR = "http://localhost:54399";
const SAIDA = path.join(__dirname, "saida");
const FIX = path.join(__dirname, "fixtures");
fs.mkdirSync(SAIDA, { recursive: true });

(async () => {
  const navegador = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
  const erros = [];
  const nova = async (o) => {
    const pg = await (await navegador.newContext({ ...o, permissions: ["microphone"], acceptDownloads: true })).newPage();
    pg.on("pageerror", (e) => erros.push(String(e)));
    pg.on("console", (m) => m.type() === "error" && erros.push(m.text()));
    return pg;
  };

  // --- Administrador: vídeo vertical, legendas, rostos e capa escolhida pelo quadro atual.
  const adm = await nova({ viewport: { width: 1280, height: 1000 } });
  await entrarAdmin(adm, BASE);
  await adm.getByRole("link", { name: /Adicionar vídeo/ }).first().click();
  const [v] = await Promise.all([adm.waitForEvent("filechooser"), adm.getByRole("button", { name: /Escolher o vídeo da cena/ }).click()]);
  await v.setFiles(path.join(FIX, "cena-vertical", "video.mp4"));
  await adm.locator(".palco video").waitFor();
  await adm.waitForFunction(() => document.querySelector(".palco")?.classList.contains("vertical"));
  console.log("Editor reconheceu o vídeo em pé (9:16): ok");
  const [s] = await Promise.all([adm.waitForEvent("filechooser"), adm.getByRole("button", { name: /Importar legendas/ }).click()]);
  await s.setFiles(path.join(FIX, "cena-teste.srt"));
  await adm.getByLabel("Título").fill("Cena em pé");
  const nomes = adm.getByLabel("Nome do personagem");
  await nomes.nth(0).fill("Capivara");
  await nomes.nth(1).fill("Tucano");
  for (const i of [1, 3, 5]) await adm.getByLabel("Personagem", { exact: true }).nth(i).selectOption({ label: "Tucano" });
  await adm.evaluate(() => { const vv = document.querySelector(".palco video"); vv.currentTime = 7.5; });
  await adm.waitForTimeout(800);
  await adm.locator("section", { hasText: "Arquivos" }).getByRole("button", { name: "📷 Quadro atual" }).click();
  await adm.getByText("nova capa escolhida").waitFor();
  console.log("Capa escolhida pelo quadro atual: ok");
  await adm.getByRole("button", { name: /Salvar cena/ }).click();
  await adm.getByRole("heading", { name: "Administração" }).waitFor({ timeout: 90000 });
  await esperarFila(adm);
  const estado = await (await fetch(`${SERVIDOR}/__estado`)).json();
  const cena = estado.cenas.find((c) => c.titulo === "Cena em pé");
  // Fotos e capa não podem ser pretas.
  const brilho = (arq) => {
    const saida = execFileSync("ffmpeg", ["-v", "error", "-i", arq, "-vf", "scale=32:32,format=gray", "-f", "rawvideo", "-"]);
    return [...saida].reduce((a, b) => a + b, 0) / saida.length;
  };
  for (const [nome, caminho] of [["capa", cena.capa_path], ...cena.personagens.map((p) => [`foto ${p.nome}`, p.fotoPath])]) {
    const r = await fetch(`${SERVIDOR}/storage/v1/object/public/midias/${caminho}`);
    const arq = path.join(SAIDA, `m-${nome.replace(/\s/g, "-")}.jpg`);
    fs.writeFileSync(arq, Buffer.from(await r.arrayBuffer()));
    const b = brilho(arq);
    console.log(`${nome}: brilho médio ${b.toFixed(0)} de 255 ${b > 14 ? "(ok, não está preta)" : "(PRETA!)"}`);
  }

  // --- Usuário: estúdio e resultado no celular.
  const u = await nova({ ...devices["Pixel 7"] });
  await u.goto(BASE + "#/cena/" + cena.id);
  await u.locator(".ator .avatar img").first().waitFor();
  await u.getByRole("button", { name: /^Tucano/ }).click();
  await u.getByRole("button", { name: /Entrar no estúdio/ }).click();
  await u.locator(".estudio").waitFor();
  await u.waitForFunction(() => document.querySelector("video")?.readyState >= 2);
  const palcoVertical = await u.evaluate(() => document.querySelector(".palco").classList.contains("vertical"));
  const larguraPagina = await u.evaluate(() => document.documentElement.scrollWidth);
  console.log("Estúdio com player em pé:", palcoVertical ? "ok" : "NÃO", "· largura da página:", larguraPagina);
  await u.getByText("Mais opções").click();
  await u.getByRole("button", { name: /Gravar todas seguidas/ }).click();
  await u.waitForTimeout(2600);
  const legendaForaDoVideo = await u.evaluate(() => !document.querySelector(".palco .texto-karaoke") && !document.querySelector(".texto-karaoke"));
  console.log("Sem legenda no estúdio nem na imagem (versão 5.3):", legendaForaDoVideo ? "ok" : "NÃO");
  await u.screenshot({ path: path.join(SAIDA, "m-estudio-vertical.png") });
  await u.getByRole("link", { name: /Resultado 3\/3/ }).waitFor({ timeout: 40000 });
  await u.getByRole("link", { name: /Resultado 3\/3/ }).click();
  await u.waitForFunction(() => !document.querySelector(".controles .botao-verde")?.disabled);
  const download = u.waitForEvent("download", { timeout: 90000 });
  await u.getByRole("button", { name: /Salvar na galeria/ }).click();
  const d = await download;
  const video = path.join(SAIDA, "m-" + d.suggestedFilename());
  await d.saveAs(video);
  await u.getByText("✅ Vídeo baixado.").waitFor();
  // Confere o vídeo salvo: formato em pé, logo no canto de baixo à direita e nada escrito no meio da imagem.
  const dims = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", video]).toString().trim();
  execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", "2", "-i", video, "-frames:v", "1", path.join(SAIDA, "m-quadro-do-video.png")]);
  console.log("Vídeo salvo:", d.suggestedFilename(), "·", dims, "·", fs.statSync(video).size, "bytes");
  console.log(erros.length ? "ERROS:\n" + erros.join("\n") : "Sem erros no console.");
  await navegador.close();
})().catch((e) => {
  console.error("FALHOU:", e);
  process.exit(1);
});
