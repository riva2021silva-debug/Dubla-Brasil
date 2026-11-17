// Teste da galeria com três pessoas: a autora grava e publica; outra pessoa curte, comenta e denuncia;
// o administrador oculta e apaga. Roda contra o servidor simulado (testes/servidor-falso.cjs).
const { chromium, devices } = require("playwright");
const fs = require("fs");
const path = require("path");
const { entrarAdmin, criarCenaTeste } = require("./auxiliar.cjs");
const BASE = process.argv[2] || "http://localhost:4174/";
const SERVIDOR = "http://localhost:54399";
const SAIDA = path.join(__dirname, "saida");
fs.mkdirSync(SAIDA, { recursive: true });
const estado = async () => (await fetch(`${SERVIDOR}/__estado`)).json();

(async () => {
  const navegador = await chromium.launch({
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
  });
  const erros = [];
  const nova = async (opcoes) => {
    const ctx = await navegador.newContext({ ...opcoes, permissions: ["microphone"] });
    const pg = await ctx.newPage();
    pg.on("pageerror", (e) => erros.push(String(e)));
    pg.on("console", (m) => m.type() === "error" && !/status of 40[039]/.test(m.text()) && erros.push(m.text()));
    return pg;
  };

  // Administrador cadastra a cena.
  const adm = await nova({ viewport: { width: 1280, height: 900 } });
  await entrarAdmin(adm, BASE);
  await criarCenaTeste(adm, "Cadê meu chinelo?");
  const cenaId = (await estado()).cenas[0].id;

  // Autora: grava as falas da Capivara e publica.
  const ana = await nova({ ...devices["Pixel 7"] });
  await ana.goto(BASE + "#/galeria");
  await ana.getByText("Nenhum dub publicado ainda").waitFor();
  await ana.goto(BASE + "#/cena/" + cenaId);
  await ana.getByRole("button", { name: /^Tucano/ }).click();
  await ana.getByRole("button", { name: /Entrar no estúdio/ }).click();
  await ana.locator(".estudio").waitFor();
  await ana.waitForFunction(() => document.querySelector("video")?.readyState >= 2);
  await ana.getByText("Mais opções").click();
  await ana.getByRole("button", { name: /Gravar todas seguidas/ }).click();
  await ana.getByRole("link", { name: /Resultado 3\/3/ }).waitFor({ timeout: 40000 });
  await ana.getByRole("link", { name: /Resultado 3\/3/ }).click();
  await ana.getByRole("button", { name: /Publicar na galeria/ }).waitFor();
  await ana.waitForFunction(() => !document.querySelector(".controles .botao-verde")?.disabled);
  await ana.getByRole("button", { name: /Publicar na galeria/ }).click();
  await ana.getByRole("heading", { name: "Escolha seu apelido" }).waitFor();
  await ana.locator("#apelido").fill("ab");
  await ana.getByRole("button", { name: "Continuar" }).click();
  await ana.getByText(/Use de 3 a 20/).waitFor();
  await ana.locator("#apelido").fill("Voz_de_Ouro");
  await ana.getByRole("button", { name: "Continuar" }).click();
  await ana.waitForURL(/#\/galeria\?p=/, { timeout: 60000 });
  await ana.locator(".post").first().waitFor();
  await ana.getByText("@Voz_de_Ouro").waitFor();
  console.log("Autora publicou com o apelido @Voz_de_Ouro: ok");
  await ana.waitForTimeout(1500);
  await ana.screenshot({ path: path.join(SAIDA, "g1-galeria.png") });
  await ana.getByRole("button", { name: /^Curtir/ }).click();
  await ana.getByRole("button", { name: "Curtir (1)" }).waitFor();
  const autoraNaoDenuncia = (await ana.getByRole("button", { name: "Denunciar" }).count()) === 0;
  console.log("Curtiu o próprio dub (1 curtida); autora não vê 'Denunciar' no próprio dub:", autoraNaoDenuncia ? "ok" : "FALHOU");

  // Outra pessoa: curte, comenta (pede apelido) e denuncia.
  const beto = await nova({ ...devices["Pixel 7"] });
  await beto.goto(BASE + "#/galeria");
  await beto.getByText("@Voz_de_Ouro").waitFor();
  await beto.locator(".post-video").first().dblclick(); // toque duplo curte, como no TikTok
  await beto.locator(".coracao-voador").first().waitFor();
  await beto.getByRole("button", { name: "Curtir (2)" }).waitFor();
  console.log("Toque duplo no vídeo curte (com coração): ok");
  await beto.screenshot({ path: path.join(SAIDA, "g4-toque-duplo.png") });
  await beto.getByRole("button", { name: /^Curtir/ }).click(); // desfaz
  await beto.getByRole("button", { name: "Curtir (1)" }).waitFor();
  await beto.getByRole("button", { name: /^Não curtir/ }).click();
  await beto.getByRole("button", { name: "Não curtir (1)" }).waitFor();
  console.log("Curtir, desfazer e não curtir atualizam os números: ok");
  await beto.getByRole("button", { name: /^Comentários/ }).click();
  await beto.getByText("Ninguém comentou ainda").waitFor();
  await beto.locator("#novo-comentario").fill("Ficou demais! 😂");
  await beto.getByRole("button", { name: "Enviar", exact: true }).click();
  await beto.getByRole("heading", { name: "Escolha seu apelido" }).waitFor();
  await beto.locator("#apelido").fill("voz_de_ouro");
  await beto.getByRole("button", { name: "Continuar" }).click();
  await beto.getByText("Esse apelido já está em uso").waitFor();
  console.log("Apelido repetido (outra caixa) recusado: ok");
  await beto.locator("#apelido").fill("Beto_2");
  await beto.getByRole("button", { name: "Continuar" }).click();
  await beto.getByText("Ficou demais! 😂").waitFor();
  await beto.getByRole("heading", { name: "1 comentário" }).waitFor();
  await beto.screenshot({ path: path.join(SAIDA, "g2-comentarios.png") });
  await beto.getByRole("button", { name: "Fechar" }).click();
  await beto.getByRole("button", { name: "Comentários (1)" }).waitFor();
  console.log("Comentário publicado com @Beto_2: ok");
  await beto.getByRole("button", { name: "Denunciar" }).click();
  await beto.getByText("Obrigado! O administrador vai revisar").waitFor();
  await beto.getByRole("button", { name: "Denunciar" }).click();
  await beto.getByText("Você já denunciou este dub.").waitFor();
  console.log("Denúncia registrada uma vez só: ok");
  const ehAutorBeto = (await beto.getByRole("button", { name: "Apagar dub" }).count()) > 0;
  console.log("Outra pessoa não vê 'Apagar' no dub alheio:", ehAutorBeto ? "FALHOU" : "ok");

  // Administrador modera.
  await adm.goto(BASE + "#/admin");
  await adm.getByRole("tab", { name: /Galeria/ }).click();
  await adm.getByText("1 com denúncia para revisar").waitFor();
  await adm.screenshot({ path: path.join(SAIDA, "g3-admin-galeria.png") });
  await adm.getByRole("button", { name: "Ocultar" }).click();
  await adm.getByText("Oculto", { exact: true }).waitFor();
  await beto.goto(BASE + "#/cenas");
  await beto.goto(BASE + "#/galeria");
  await beto.getByText("Nenhum dub publicado ainda").waitFor();
  console.log("Dub ocultado some da galeria: ok");
  await adm.getByRole("button", { name: /Apagar dub de/ }).click();
  await adm.getByRole("button", { name: "Confirmar exclusão" }).click();
  await adm.getByText("Nenhum dub publicado na galeria ainda.").waitFor();
  const fim = await estado();
  console.log(
    "Depois de apagar:", fim.publicacoes.length, "publicações,", fim.comentarios.length, "comentários,", fim.reacoes.length, "reações,",
    fim.arquivos.filter((a) => a.startsWith("dubs/")).length, "arquivos de dub",
  );

  console.log(erros.length ? "ERROS:\n" + erros.join("\n") : "Sem erros no console.");
  await navegador.close();
})().catch((e) => {
  console.error("FALHOU:", e);
  process.exit(1);
});
