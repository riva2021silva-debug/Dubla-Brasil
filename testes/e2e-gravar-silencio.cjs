// Microfone sem eco (versão 4.1): enquanto a pessoa grava, o alto-falante fica quase mudo na fala dela
// (o microfone não capta de volta a voz original nem a música). Mede o que sai no alto-falante durante a gravação:
// nas falas da pessoa precisa ficar bem mais baixo que no resto da cena.
const { chromium, devices } = require("playwright");
const { entrarAdmin, criarCenaTeste } = require("./auxiliar.cjs");
const BASE = process.argv[2] || "http://localhost:4174/";
const SERVIDOR = "http://localhost:54399";

(async () => {
  const nav = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
  const erros = [];
  const adm = await (await nav.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await entrarAdmin(adm, BASE);
  await criarCenaTeste(adm, "Silêncio ao gravar");
  const cena = (await (await fetch(`${SERVIDOR}/__estado`)).json()).cenas[0];

  const ctx = await nav.newContext({ ...devices["Pixel 7"], permissions: ["microphone"] });
  // "Ouvido" no alto-falante: tudo o que vai para a saída de som passa também por um medidor.
  await ctx.addInitScript(() => {
    const ligar = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (destino, ...resto) {
      const r = ligar.call(this, destino, ...resto);
      if (typeof AudioDestinationNode !== "undefined" && destino instanceof AudioDestinationNode) {
        const c = this.context;
        if (!c.__medidor) {
          c.__medidor = c.createAnalyser();
          c.__medidor.fftSize = 2048;
          const buf = new Float32Array(2048);
          window.__amostras = [];
          setInterval(() => {
            const v = document.querySelector(".estudio video");
            if (!v || v.paused || !document.querySelector(".estudio")) return;
            c.__medidor.getFloatTimeDomainData(buf);
            let s = 0;
            for (const x of buf) s += x * x;
            window.__amostras.push({ ms: v.currentTime * 1000, rms: Math.sqrt(s / buf.length) });
          }, 40);
        }
        ligar.call(this, c.__medidor);
      }
      return r;
    };
  });
  const pg = await ctx.newPage();
  pg.on("pageerror", (e) => erros.push(String(e)));
  await pg.goto(BASE + "#/cena/" + cena.id);
  await pg.getByRole("button", { name: /^Tucano/ }).click(); // dubla só a Capivara
  await pg.getByRole("button", { name: /Entrar no estúdio/ }).click();
  await pg.locator(".estudio").waitFor();
  await pg.waitForFunction(() => document.querySelector("video")?.readyState >= 2);
  await pg.getByText("Mais opções").click();
  await pg.getByRole("button", { name: /Gravar todas seguidas/ }).click();
  await pg.getByRole("link", { name: /Resultado 3\/3/ }).waitFor({ timeout: 60000 });
  const amostras = await pg.evaluate(() => window.__amostras);

  const capivara = cena.personagens.find((p) => p.nome === "Capivara").id;
  const minhas = cena.falas.filter((f) => f.personagemId === capivara);
  const outras = cena.falas.filter((f) => f.personagemId !== capivara);
  const media = (lista) => {
    const v = amostras.filter((a) => lista.some((f) => a.ms > f.inicioMs + 150 && a.ms < f.fimMs - 150)).map((a) => a.rms);
    return { n: v.length, rms: v.reduce((s, x) => s + x, 0) / Math.max(1, v.length) };
  };
  const naMinha = media(minhas), naOutra = media(outras);
  const db = (x) => (20 * Math.log10(x + 1e-9)).toFixed(1);
  console.log(`Alto-falante enquanto grava: nas suas falas ${db(naMinha.rms)} dB (${naMinha.n} medidas) · nas falas dos outros ${db(naOutra.rms)} dB (${naOutra.n} medidas)`);
  const ok = naMinha.n > 5 && naOutra.n > 5 && naMinha.rms < naOutra.rms * 0.25;
  console.log("Na sua fala o alto-falante fica quase mudo (≥ 12 dB mais baixo):", ok ? "ok" : "FALHOU");
  console.log(erros.length ? "ERROS:\n" + erros.join("\n") : "Sem erros no console.");
  await nav.close();
})().catch((e) => {
  console.error("FALHOU:", e);
  process.exit(1);
});
