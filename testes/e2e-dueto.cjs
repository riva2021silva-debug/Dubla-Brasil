// Dueto + Notificações: Ana dubla a Capivara (microfone em 600 Hz) e publica; Beto abre o dub dela, toca em
// "Dublar junto", dubla o Tucano (microfone em 900 Hz) e publica. O vídeo final precisa ter as DUAS vozes:
// 600 Hz nas falas da Capivara e 900 Hz nas do Tucano. Ana recebe os avisos de curtida, comentário e dueto.
const { chromium, devices } = require("playwright");
const fs = require("fs");
const path = require("path");
const { entrarAdmin, criarCenaTeste } = require("./auxiliar.cjs");
const BASE = process.argv[2] || "http://localhost:4174/";
const SERVIDOR = "http://localhost:54399";
const SAIDA = path.join(__dirname, "saida");
fs.mkdirSync(SAIDA, { recursive: true });
const estado = async () => (await fetch(`${SERVIDOR}/__estado`)).json();

/** WAV mono 48 kHz com um tom contínuo (o "microfone" falso do Chrome repete o arquivo). */
function tom(freq, arquivo) {
  const taxa = 48000, n = taxa * 4, dados = Buffer.alloc(44 + n * 2);
  dados.write("RIFF", 0); dados.writeUInt32LE(36 + n * 2, 4); dados.write("WAVEfmt ", 8);
  dados.writeUInt32LE(16, 16); dados.writeUInt16LE(1, 20); dados.writeUInt16LE(1, 22); dados.writeUInt32LE(taxa, 24);
  dados.writeUInt32LE(taxa * 2, 28); dados.writeUInt16LE(2, 32); dados.writeUInt16LE(16, 34); dados.write("data", 36); dados.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) dados.writeInt16LE(Math.round(Math.sin((2 * Math.PI * freq * i) / taxa) * 12000), 44 + i * 2);
  fs.writeFileSync(arquivo, dados);
  return arquivo;
}

const erros = [];
async function navegadorCom(freq) {
  const nav = await chromium.launch({
    args: [
      "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required",
      `--use-file-for-fake-audio-capture=${tom(freq, path.join(SAIDA, `tom-${freq}.wav`))}`,
    ],
  });
  const ctx = await nav.newContext({ ...devices["Pixel 7"], permissions: ["microphone"] });
  const pg = await ctx.newPage();
  pg.on("pageerror", (e) => erros.push(String(e)));
  pg.on("console", (m) => m.type() === "error" && !/status of 40[0349]/.test(m.text()) && erros.push(m.text()));
  return { nav, pg };
}

async function gravarTudoEPublicar(pg, apelido) {
  await pg.locator(".estudio").waitFor();
  await pg.waitForFunction(() => document.querySelector("video")?.readyState >= 2);
  await pg.getByText("Mais opções").click();
  await pg.getByRole("button", { name: /Gravar todas seguidas/ }).click();
  await pg.getByRole("link", { name: /Resultado 3\/3/ }).waitFor({ timeout: 60000 });
  await pg.getByRole("link", { name: /Resultado 3\/3/ }).click();
  await pg.getByRole("button", { name: /Publicar na galeria/ }).waitFor();
  await pg.waitForFunction(() => !document.querySelector(".controles .botao-verde")?.disabled);
  await pg.getByRole("button", { name: /Publicar na galeria/ }).click();
  await pg.getByRole("heading", { name: "Escolha seu apelido" }).waitFor();
  await pg.locator("#apelido").fill(apelido);
  await pg.getByRole("button", { name: "Continuar" }).click();
  await pg.waitForURL(/#\/galeria\?p=/, { timeout: 90000 });
  return new URL(pg.url().replace("#/", "")).searchParams.get("p");
}

/** Força de cada tom (600 e 900 Hz) no áudio do vídeo publicado, no meio de cada fala. */
async function tonsNasFalas(pg, url, falas) {
  return pg.evaluate(
    async ({ url, falas }) => {
      const ctx = new AudioContext();
      const buf = await ctx.decodeAudioData(await (await fetch(url)).arrayBuffer());
      const x = buf.getChannelData(0), taxa = buf.sampleRate;
      const goertzel = (ini, n, f) => {
        const k = 2 * Math.cos((2 * Math.PI * f) / taxa);
        let s1 = 0, s2 = 0;
        for (let i = 0; i < n; i++) {
          const s = x[ini + i] + k * s1 - s2;
          s2 = s1;
          s1 = s;
        }
        return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - k * s1 * s2)) / n;
      };
      return falas.map((f) => {
        const meio = (f.inicioMs + f.fimMs) / 2000, n = Math.round(0.3 * taxa), ini = Math.max(0, Math.round(meio * taxa) - n / 2);
        return { quem: f.quem, t600: goertzel(ini, n, 600), t900: goertzel(ini, n, 900) };
      });
    },
    { url, falas },
  );
}

(async () => {
  // Administrador cadastra a cena (Capivara e Tucano, 3 falas cada).
  const adm = await chromium.launch();
  const pa = await (await adm.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await entrarAdmin(pa, BASE);
  await criarCenaTeste(pa, "Cadê meu chinelo?");
  const cena = (await estado()).cenas[0];
  await adm.close();

  // Ana dubla só a Capivara e publica.
  const A = await navegadorCom(600);
  const ana = A.pg;
  await ana.goto(BASE + "#/cena/" + cena.id);
  await ana.getByRole("button", { name: /^Tucano/ }).click();
  await ana.getByRole("button", { name: /Entrar no estúdio/ }).click();
  const pubAna = await gravarTudoEPublicar(ana, "Ana_Voz");
  console.log("Ana publicou o dub da Capivara: ok");
  const semAvisos = await ana.locator(".sino .selo-sino").count();
  console.log("Sino da Ana sem avisos no começo:", semAvisos === 0 ? "ok" : "FALHOU");

  // Beto: curte, comenta e toca em "Dublar junto".
  const B = await navegadorCom(900);
  const beto = B.pg;
  await beto.goto(BASE + "#/galeria?p=" + pubAna);
  await beto.getByText("@Ana_Voz").first().waitFor();
  await beto.getByRole("button", { name: /^Curtir/ }).first().click();
  await beto.getByRole("button", { name: "Curtir (1)" }).waitFor();
  await beto.getByRole("link", { name: "Dublar junto com @Ana_Voz" }).first().click();
  await beto.getByText("🎭 Dueto com @Ana_Voz").waitFor();
  const capivaraTravada = await beto.getByRole("button", { name: /^Capivara.*com a voz de @Ana_Voz/ }).getAttribute("aria-disabled");
  const tucanoMeu = await beto.getByRole("button", { name: /^Tucano/ }).getAttribute("aria-pressed");
  console.log("Dueto: Capivara fica com a Ana, Beto dubla o Tucano:", capivaraTravada === "true" && tucanoMeu === "true" ? "ok" : `FALHOU (${capivaraTravada}, ${tucanoMeu})`);
  await beto.screenshot({ path: path.join(SAIDA, "dueto-1-escolher.png") });
  await beto.getByRole("button", { name: /Entrar no estúdio/ }).click();
  await beto.getByText("🎭 Dueto com @Ana_Voz").waitFor();
  const videoBase = await beto.locator(".estudio video").first().getAttribute("src");
  console.log("Estúdio do dueto usa o vídeo publicado da Ana:", /\/dubs\//.test(videoBase || "") ? "ok" : `FALHOU (${videoBase})`);
  const pubBeto = await gravarTudoEPublicar(beto, "Beto_Dueto");
  await beto.getByText("🎭 Dueto com @Ana_Voz").first().waitFor();
  await beto.screenshot({ path: path.join(SAIDA, "dueto-2-galeria.png") });
  const fim = await estado();
  const dueto = fim.publicacoes.find((p) => p.id === pubBeto);
  console.log(
    "Dueto publicado ligado ao dub da Ana, com os dois personagens:",
    dueto.dueto_de === pubAna && dueto.dueto_apelido === "Ana_Voz" && dueto.papeis.sort().join(",") === "Capivara,Tucano" ? "ok" : `FALHOU (${JSON.stringify(dueto)})`,
  );

  // As duas vozes no vídeo final.
  const nomeDe = Object.fromEntries(cena.personagens.map((p) => [p.id, p.nome]));
  const falas = cena.falas.map((f) => ({ quem: nomeDe[f.personagemId], inicioMs: f.inicioMs, fimMs: f.fimMs }));
  const tons = await tonsNasFalas(beto, `${SERVIDOR}/storage/v1/object/public/dubs/${dueto.video_path}`, falas);
  for (const t of tons) console.log(`  ${t.quem.padEnd(8)} 600 Hz=${t.t600.toFixed(4)}  900 Hz=${t.t900.toFixed(4)}`);
  const certo = tons.every((t) => (t.quem === "Capivara" ? t.t600 > 2 * t.t900 && t.t600 > 0.005 : t.t900 > 2 * t.t600 && t.t900 > 0.005));
  console.log("Vídeo final com a voz da Ana nas falas da Capivara e a do Beto nas do Tucano:", certo ? "ok" : "FALHOU");

  // Beto comenta no dub da Ana (o dueto já avisou).
  await beto.goto(BASE + "#/galeria?p=" + pubAna);
  const postAna = beto.locator(".post", { has: beto.getByText("Dublando: Capivara", { exact: true }) }).first();
  await postAna.waitFor();
  await beto.waitForTimeout(800); // o feed termina de carregar
  await postAna.getByLabel("Faça um comentário").fill("Bora dublar junto!");
  await postAna.getByRole("button", { name: "Enviar comentário" }).click();
  await beto.getByText("💬 Comentário enviado!").waitFor();
  // Beto curte o próprio dueto: ninguém é avisado de si mesmo.
  await beto.goto(BASE + "#/galeria?p=" + pubBeto);
  await beto.getByRole("button", { name: /^Curtir/ }).first().click();

  // Ana vê o sino com 3 avisos e abre o dueto pelo aviso.
  await ana.getByRole("link", { name: "Cenas" }).first().click(); // trocar de tela já confere os avisos
  await ana.locator(".sino .selo-sino", { hasText: "3" }).waitFor();
  const selo = await ana.locator(".sino .selo-sino").textContent();
  console.log("Sino da Ana com 3 avisos:", selo === "3" ? "ok" : `FALHOU (${selo})`);
  await ana.locator(".sino").click();
  await ana.getByRole("heading", { name: "🔔 Notificações" }).waitFor();
  const textos = await ana.locator(".notificacao").allInnerTexts();
  const tem = (re) => textos.some((t) => re.test(t));
  console.log(
    "Avisos: curtida, comentário e dueto:",
    tem(/@Beto_Dueto curtiu seu dub/) && tem(/@Beto_Dueto comentou no seu dub[\s\S]*Bora dublar junto!/) && tem(/@Beto_Dueto dublou junto com você/) ? "ok" : `FALHOU\n${textos.join("\n---\n")}`,
  );
  await ana.screenshot({ path: path.join(SAIDA, "dueto-3-notificacoes.png") });
  await ana.waitForFunction(() => !document.querySelector(".sino .selo-sino"));
  console.log("Abriu os avisos: sino zerado: ok");
  await ana.locator(".notificacao", { hasText: "dublou junto" }).click();
  await ana.waitForURL(new RegExp(`p=${pubBeto}`));
  await ana.getByText("@Beto_Dueto").first().waitFor();
  console.log("Tocar no aviso abre o dueto na galeria: ok");
  const daBeto = (await estado()).notificacoes.filter((n) => n.para === dueto.autor_id).length;
  console.log("Beto não recebeu aviso do próprio dueto/curtida:", daBeto === 0 ? "ok" : `FALHOU (${daBeto})`);

  console.log(erros.length ? "ERROS:\n" + erros.join("\n") : "Sem erros no console.");
  await A.nav.close();
  await B.nav.close();
})().catch((e) => {
  console.error("FALHOU:", e);
  process.exit(1);
});
