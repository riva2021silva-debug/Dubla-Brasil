// Teste da edição de vídeo no editor (versão 2.4): cortar começo/fim e passar para 9:16.
// Confere o arquivo salvo (formato em pé e duração), as falas ajustadas e a trilha de fundo cortada.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { entrarAdmin } = require("./auxiliar.cjs");
const BASE = process.argv[2] || "http://localhost:4174/";
const SERVIDOR = "http://localhost:54399";
const SAIDA = path.join(__dirname, "saida");
const FIX = path.join(__dirname, "fixtures");
fs.mkdirSync(SAIDA, { recursive: true });

const mudarFaixa = (p, id, valor) =>
  p.evaluate(
    ([id, valor]) => {
      const el = document.getElementById(id);
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, String(valor));
      el.dispatchEvent(new Event("input", { bubbles: true }));
    },
    [id, valor],
  );

(async () => {
  const navegador = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  const erros = [];
  const p = await (await navegador.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })).newPage();
  p.on("pageerror", (e) => erros.push(String(e)));
  p.on("console", (m) => m.type() === "error" && erros.push(m.text()));

  await entrarAdmin(p, BASE);
  await p.getByRole("link", { name: /Adicionar vídeo/ }).first().click();
  const [v] = await Promise.all([p.waitForEvent("filechooser"), p.getByRole("button", { name: /Escolher o vídeo da cena/ }).click()]);
  await v.setFiles(path.join(FIX, "cena-teste", "video.mp4"));
  await p.locator(".palco video").waitFor();
  const [f] = await Promise.all([p.waitForEvent("filechooser"), p.locator("section", { hasText: "Arquivos" }).getByRole("button", { name: "Escolher" }).click()]);
  await f.setFiles(path.join(FIX, "cena-teste", "fundo.m4a"));
  await p.getByText("carregada").waitFor();
  const [s] = await Promise.all([p.waitForEvent("filechooser"), p.getByRole("button", { name: /Importar legendas/ }).click()]);
  await s.setFiles(path.join(FIX, "cena-teste.srt"));
  await p.getByRole("heading", { name: "Falas (6)" }).waitFor();
  await p.getByLabel("Título").fill("Cena cortada em pé");

  await p.getByRole("button", { name: /Editar vídeo/ }).click();
  await p.getByRole("heading", { name: /Editar vídeo/ }).waitFor();
  await p.waitForFunction(() => document.querySelector(".quadro-recorte video")?.readyState >= 1);
  await mudarFaixa(p, "corte-inicio", 3000);
  await mudarFaixa(p, "corte-fim", 13000);
  await p.getByText("Trecho: 0:10").waitFor();
  await p.getByRole("radio", { name: /9:16/ }).click();
  await p.locator("#posicao-recorte").waitFor();
  await mudarFaixa(p, "posicao-recorte", 75);
  await p.getByText("As falas e a trilha de fundo serão ajustadas").waitFor();
  await p.waitForTimeout(500);
  await p.screenshot({ path: path.join(SAIDA, "e1-editar-video.png") });
  console.log("Janela de edição: corte 0:03–0:13 e formato 9:16 com moldura: ok");
  const t0 = Date.now();
  await p.getByRole("button", { name: /Aplicar edição/ }).click();
  await p.locator(".progresso-edicao").waitFor();
  await p.getByText(/Vídeo editado \(/).waitFor({ timeout: 60000 });
  console.log(`Vídeo editado gerado em ${((Date.now() - t0) / 1000).toFixed(1)} s: ok`);
  await p.getByRole("heading", { name: "Falas (3)" }).waitFor();
  console.log("Falas ajustadas ao corte (6 → 3): ok");
  await p.waitForFunction(() => document.querySelector(".palco")?.classList.contains("vertical"));
  await p.screenshot({ path: path.join(SAIDA, "e2-editor-depois.png") });
  console.log("Editor mostra o vídeo em pé: ok");

  await p.getByRole("button", { name: /Salvar cena/ }).click();
  await p.getByRole("heading", { name: "Administração" }).waitFor({ timeout: 90000 });
  const estado = await (await fetch(`${SERVIDOR}/__estado`)).json();
  const cena = estado.cenas.find((c) => c.titulo === "Cena cortada em pé");
  const baixar = async (caminho, nome) => {
    const r = await fetch(`${SERVIDOR}/storage/v1/object/public/midias/${caminho}`);
    const arq = path.join(SAIDA, nome);
    fs.writeFileSync(arq, Buffer.from(await r.arrayBuffer()));
    return arq;
  };
  const arqVideo = await baixar(cena.video_path, "e-video" + path.extname(cena.video_path));
  const info = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", arqVideo]).toString().trim();
  const [lv, av] = info.split(",").map(Number);
  // Duração lida dos quadros (o MediaRecorder nem sempre grava a duração no arquivo).
  const tempos = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "frame=pts_time", "-of", "csv=p=0", arqVideo]).toString().trim().split("\n").map(Number);
  const durVideo = tempos[tempos.length - 1] - tempos[0];
  const temSom = execFileSync("ffprobe", ["-v", "error", "-select_streams", "a", "-show_entries", "stream=codec_type", "-of", "csv=p=0", arqVideo]).toString().includes("audio");
  console.log(`Vídeo salvo: ${lv}x${av}, ${durVideo.toFixed(1)} s, com som: ${temSom}`, av > lv && Math.abs(lv / av - 9 / 16) < 0.02 && Math.abs(durVideo - 10) < 1 && temSom ? "ok" : "FALHOU");
  const arqFundo = await baixar(cena.fundo_path, "e-fundo" + path.extname(cena.fundo_path));
  const durFundo = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", arqFundo]).toString());
  console.log(`Trilha de fundo cortada: ${durFundo.toFixed(1)} s`, Math.abs(durFundo - 10) < 0.3 ? "ok" : "FALHOU");
  const falas = cena.falas.map((x) => `${x.inicioMs}-${x.fimMs}`).join(", ");
  console.log(`Tempos das falas no servidor: ${falas}`, cena.falas.length === 3 && cena.falas[0].inicioMs === 800 ? "ok" : "FALHOU");
  execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", "2", "-i", arqVideo, "-frames:v", "1", path.join(SAIDA, "e3-quadro-9x16.png")]);
  console.log(erros.length ? "ERROS:\n" + erros.join("\n") : "Sem erros no console.");
  await navegador.close();
})().catch((e) => {
  console.error("FALHOU:", e);
  process.exit(1);
});
