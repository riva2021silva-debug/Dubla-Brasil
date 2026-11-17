// Teste da câmera estilo chamada (versão 2.0): liga a câmera no estúdio, grava as falas,
// confere o trecho salvo, o quadradinho no resultado e no vídeo salvo. Usa a câmera falsa do Chrome.
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

/** Diferença média (0–255) do canto de cima à direita entre um quadro do vídeo salvo e o original. */
function diferencaNoCanto(video, seg, recorte = "crop=80:80:230:8") {
  const canto = (arq) =>
    execFileSync("ffmpeg", ["-v", "error", "-ss", String(seg), "-i", arq, "-frames:v", "1", "-vf", `scale=320:180,${recorte},format=gray`, "-f", "rawvideo", "-"]);
  const a = canto(video);
  const b = canto(ORIGINAL);
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
}

(async () => {
  const navegador = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
  const erros = [];
  const nova = async (o) => {
    const pg = await (await navegador.newContext({ ...o, permissions: ["microphone", "camera"], acceptDownloads: true })).newPage();
    pg.on("pageerror", (e) => erros.push(String(e)));
    pg.on("console", (m) => m.type() === "error" && erros.push(m.text()));
    return pg;
  };

  const adm = await nova({ viewport: { width: 1280, height: 900 } });
  await entrarAdmin(adm, BASE);
  await criarCenaTeste(adm, "Cena da câmera");
  const cenaId = (await (await fetch(`${SERVIDOR}/__estado`)).json()).cenas.find((c) => c.titulo === "Cena da câmera").id;

  const u = await nova({ ...devices["Pixel 7"] });
  await u.goto(BASE + "#/cena/" + cenaId);
  await u.getByRole("button", { name: /^Tucano/ }).click();
  await u.getByRole("button", { name: /Entrar no estúdio/ }).click();
  await u.locator(".estudio").waitFor();
  await u.waitForFunction(() => document.querySelector("video")?.readyState >= 2);
  await u.getByTitle(/Gravar a câmera junto/).click();
  await u.waitForFunction(() => document.querySelector(".pip-camera video")?.readyState >= 2);
  console.log("Câmera ligada com prévia no cantinho do estúdio: ok");
  await u.getByText("Mais opções").click();
  await u.getByRole("button", { name: /Gravar todas seguidas/ }).click();
  await u.locator(".pip-selo").waitFor({ timeout: 10000 });
  await u.waitForTimeout(1500);
  await u.screenshot({ path: path.join(SAIDA, "c1-estudio-camera.png") });
  await u.getByRole("link", { name: /Resultado 3\/3/ }).waitFor({ timeout: 40000 });
  await u.waitForTimeout(1500);
  const trechos = await u.evaluate(
    () =>
      new Promise((resolve) => {
        const r = indexedDB.open("dubla-brasil");
        r.onsuccess = () => {
          const banco = r.result;
          const loja = "dubs";
          const g = banco.transaction(loja).objectStore(loja).getAll();
          g.onsuccess = () => resolve(g.result.flatMap((d) => (d.cameras ?? []).map((t) => ({ inicioMs: Math.round(t.inicioMs), duracaoMs: Math.round(t.duracaoMs), bytes: t.video.size, falas: t.falas.length }))));
        };
      }),
  );
  console.log("Trechos de câmera salvos:", JSON.stringify(trechos), trechos.length === 1 && trechos[0].bytes > 10000 && trechos[0].falas === 3 ? "ok" : "FALHOU");

  await u.getByRole("link", { name: /Resultado 3\/3/ }).click();
  await u.waitForFunction(() => !document.querySelector(".controles .botao-verde")?.disabled);
  await u.getByRole("button", { name: /Assistir/ }).click();
  await u.waitForFunction(() => { const p = document.querySelector(".pip-camera"); return p && !p.hidden && !p.querySelector("video").paused; }, null, { timeout: 10000 });
  await u.waitForTimeout(800);
  await u.screenshot({ path: path.join(SAIDA, "c2-resultado-camera.png") });
  console.log("Quadradinho da câmera tocando junto no resultado: ok");
  await u.getByRole("button", { name: /Pausar/ }).click();

  const download = u.waitForEvent("download", { timeout: 90000 });
  await u.getByRole("button", { name: /Salvar na galeria/ }).click();
  const d = await download;
  const video = path.join(SAIDA, "c-" + d.suggestedFilename());
  await d.saveAs(video);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", "5", "-i", video, "-frames:v", "1", path.join(SAIDA, "c3-quadro-do-video.png")]);
  const durante = diferencaNoCanto(video, 5);
  const resto = diferencaNoCanto(video, 5, "crop=80:80:40:40"); // área sem o quadradinho: deve ser igual ao original
  console.log(`Vídeo salvo: canto de cima difere do original em ${durante.toFixed(1)} (câmera), resto da imagem em ${resto.toFixed(1)}`, durante > 25 && resto < 12 ? "ok" : "FALHOU");
  console.log(erros.length ? "ERROS:\n" + erros.join("\n") : "Sem erros no console.");
  await navegador.close();
})().catch((e) => {
  console.error("FALHOU:", e);
  process.exit(1);
});
