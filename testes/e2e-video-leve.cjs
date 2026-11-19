// Vídeo leve (versão 4.2): vídeos "fragmentados" e com poucos quadros-chave (como os que o celular grava ou que a
// ferramenta "Editar vídeo" gera) travavam no estúdio a cada pulo para uma fala. Confere:
//  1) ao salvar uma cena nova, o vídeo enviado ao servidor já sai otimizado (índice no começo, quadro-chave a cada 1 s);
//  2) o botão "⚡ Otimizar vídeos" refaz uma cena antiga que já estava no servidor com vídeo ruim;
//  3) o som continua no vídeo e a duração não muda.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");
const { entrarAdmin } = require("./auxiliar.cjs");
const BASE = process.argv[2] || "http://localhost:4174/";
const SERVIDOR = "http://localhost:54399";
const SAIDA = path.join(__dirname, "saida");
fs.mkdirSync(SAIDA, { recursive: true });
const RUIM = path.join(SAIDA, "video-fragmentado.mp4");
const SRT = path.join(SAIDA, "video-leve.srt");

function analisar(arq) {
  const caixas = [];
  const d = fs.readFileSync(arq);
  for (let i = 0; i + 8 <= d.length; ) {
    let n = d.readUInt32BE(i);
    caixas.push(d.toString("latin1", i + 4, i + 8));
    if (n === 1) n = Number(d.readBigUInt64BE(i + 8));
    if (n < 8) break;
    i += n;
  }
  const chaves = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-skip_frame", "nokey", "-show_entries", "frame=pts_time", "-of", "csv=p=0", arq], { encoding: "utf8" }).stdout.trim().split("\n").map(Number);
  let maior = 0;
  for (let i = 1; i < chaves.length; i++) maior = Math.max(maior, chaves[i] - chaves[i - 1]);
  const trilhas = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type:format=duration", "-of", "json", arq], { encoding: "utf8" }).stdout;
  const j = JSON.parse(trilhas);
  return { fragmentado: caixas.includes("moof"), indiceNoComeco: caixas.indexOf("moov") < caixas.indexOf("mdat"), maiorEspacoChave: maior, temSom: j.streams.some((s) => s.codec_type === "audio"), duracao: Number(j.format.duration) };
}
const baixarDoServidor = async (caminho, nome) => {
  const r = await fetch(`${SERVIDOR}/storage/v1/object/public/midias/${caminho}`);
  const arq = path.join(SAIDA, nome);
  fs.writeFileSync(arq, Buffer.from(await r.arrayBuffer()));
  return arq;
};

(async () => {
  // Vídeo "ruim": MP4 fragmentado, quadro-chave a cada 4 s, com som.
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000",
    "-t", "12", "-c:v", "libx264", "-g", "120", "-keyint_min", "120", "-sc_threshold", "0", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest",
    "-movflags", "frag_keyframe+empty_moov+default_base_moof", RUIM]);
  fs.writeFileSync(SRT, "1\n00:00:02,000 --> 00:00:04,000\nOi!\n\n2\n00:00:06,000 --> 00:00:08,000\nTudo bem?\n");
  const antes = analisar(RUIM);
  console.log("Vídeo de teste (como o do celular):", JSON.stringify(antes));

  const nav = await chromium.launch();
  const erros = [];
  const adm = await (await nav.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  adm.on("pageerror", (e) => erros.push(String(e)));
  await entrarAdmin(adm, BASE);
  await adm.getByRole("link", { name: /Adicionar vídeo/ }).first().click();
  const [v] = await Promise.all([adm.waitForEvent("filechooser"), adm.getByRole("button", { name: /Escolher o vídeo da cena/ }).click()]);
  await v.setFiles(RUIM);
  await adm.locator(".palco video").waitFor();
  const [s] = await Promise.all([adm.waitForEvent("filechooser"), adm.getByRole("button", { name: /Importar legendas/ }).click()]);
  await s.setFiles(SRT);
  await adm.getByRole("heading", { name: "Falas (2)" }).waitFor();
  await adm.getByLabel("Título").fill("Vídeo leve");
  await adm.getByRole("button", { name: /Salvar cena/ }).click();
  await adm.getByRole("heading", { name: "Administração" }).waitFor({ timeout: 120000 });
  let cena = (await (await fetch(`${SERVIDOR}/__estado`)).json()).cenas.find((c) => c.titulo === "Vídeo leve");
  const novo = analisar(await baixarDoServidor(cena.video_path, "video-leve-salvo.mp4"));
  console.log("Vídeo que chegou ao servidor:", JSON.stringify(novo));
  const bom = (x) => !x.fragmentado && x.indiceNoComeco && x.maiorEspacoChave <= 1.1 && x.temSom && Math.abs(x.duracao - antes.duracao) < 0.15;
  console.log("1) Cena nova já sobe com o vídeo leve (sem fragmentos, índice no começo, quadro-chave a cada 1 s, com som):", bom(novo) ? "ok" : "FALHOU");

  // Cena antiga com vídeo ruim já no servidor (como as que existiam antes desta versão): troca o arquivo "por fora".
  const caminhoRuim = `cenas/${cena.id}/video-antigo.mp4`;
  const up = await fetch(`${SERVIDOR}/storage/v1/object/midias/${caminhoRuim}`, { method: "POST", headers: { Authorization: "Bearer token-admin-de-teste", "Content-Type": "video/mp4" }, body: fs.readFileSync(RUIM) });
  if (!up.ok) throw new Error("não consegui preparar a cena antiga");
  await fetch(`${SERVIDOR}/rest/v1/cenas?id=eq.${cena.id}`, { method: "PATCH", headers: { Authorization: "Bearer token-admin-de-teste", "Content-Type": "application/json" }, body: JSON.stringify({ video_path: caminhoRuim }) });
  await adm.goto(BASE + "#/cenas");
  await adm.goto(BASE + "#/admin");
  await adm.getByRole("button", { name: "⚡ Otimizar vídeos" }).click();
  await adm.getByText(/✅ vídeo otimizado/).waitFor({ timeout: 120000 });
  await adm.screenshot({ path: path.join(SAIDA, "video-leve-admin.png") });
  cena = (await (await fetch(`${SERVIDOR}/__estado`)).json()).cenas.find((c) => c.id === cena.id);
  const refeito = analisar(await baixarDoServidor(cena.video_path, "video-leve-refeito.mp4"));
  console.log("Cena antiga depois do botão:", JSON.stringify(refeito));
  console.log("2) “⚡ Otimizar vídeos” refaz a cena antiga:", cena.video_path !== caminhoRuim && bom(refeito) ? "ok" : "FALHOU");
  console.log("3) Falas da cena continuam as mesmas:", cena.falas.length === 2 && cena.falas[0].inicioMs === 2000 ? "ok" : "FALHOU");
  // Trilha de fundo antiga em WAV (pesada): o botão comprime para M4A, com a mesma duração.
  const WAV = path.join(SAIDA, "fundo-pesado.wav");
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=330:sample_rate=44100", "-t", "12", "-ac", "2", WAV]);
  const caminhoWav = `cenas/${cena.id}/fundo-antigo.wav`;
  await fetch(`${SERVIDOR}/storage/v1/object/midias/${caminhoWav}`, { method: "POST", headers: { Authorization: "Bearer token-admin-de-teste", "Content-Type": "audio/wav" }, body: fs.readFileSync(WAV) });
  await fetch(`${SERVIDOR}/rest/v1/cenas?id=eq.${cena.id}`, { method: "PATCH", headers: { Authorization: "Bearer token-admin-de-teste", "Content-Type": "application/json" }, body: JSON.stringify({ fundo_path: caminhoWav }) });
  await adm.goto(BASE + "#/cenas");
  await adm.goto(BASE + "#/admin");
  await adm.getByRole("button", { name: "⚡ Otimizar vídeos" }).click();
  await adm.getByText(/trilha de fundo comprimida/).waitFor({ timeout: 120000 });
  cena = (await (await fetch(`${SERVIDOR}/__estado`)).json()).cenas.find((c) => c.id === cena.id);
  const m4a = await baixarDoServidor(cena.fundo_path, "fundo-comprimido.m4a");
  const durM4a = Number(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", m4a], { encoding: "utf8" }).stdout);
  const kb = (f) => Math.round(fs.statSync(f).size / 1024);
  console.log(`Trilha de fundo: WAV ${kb(WAV)} KB → M4A ${kb(m4a)} KB · duração ${durM4a.toFixed(2)} s`);
  console.log("5) Trilha de fundo em WAV vira M4A bem menor, com a mesma duração:", cena.fundo_path.endsWith(".m4a") && kb(m4a) * 5 < kb(WAV) && Math.abs(durM4a - 12) < 0.2 ? "ok" : "FALHOU");
  // Rodando de novo: tudo já está leve, nada é refeito.
  await adm.getByRole("button", { name: "⚡ Otimizar vídeos" }).click();
  await adm.getByText("✅ já estava leve").first().waitFor({ timeout: 60000 });
  console.log("4) Rodar de novo não refaz o que já está leve: ok");
  console.log(erros.length ? "ERROS:\n" + erros.join("\n") : "Sem erros no console.");
  await nav.close();
})().catch((e) => {
  console.error("FALHOU:", e);
  process.exit(1);
});
