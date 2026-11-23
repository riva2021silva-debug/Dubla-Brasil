// Internet caindo no envio (versão 4.4): o app tenta de novo sozinho; se cair 3 vezes, explica e a edição fica guardada.
const { chromium } = require("playwright");
const path = require("path");
const { entrarAdmin, esperarFila } = require("./auxiliar.cjs");
const BASE = process.argv[2] || "http://localhost:4174/";
const SERVIDOR = "http://localhost:54399";
const FIX = path.join(__dirname, "fixtures");
const falhar = (n) => fetch(`${SERVIDOR}/__falhar-envios?n=${n}`);
async function novaCena(p, titulo) {
  await p.getByRole("link", { name: /Adicionar vídeo/ }).first().click();
  const [v] = await Promise.all([p.waitForEvent("filechooser"), p.getByRole("button", { name: /Escolher o vídeo da cena/ }).click()]);
  await v.setFiles(path.join(FIX, "cena-teste", "video.mp4"));
  await p.locator(".palco video").waitFor();
  const [s] = await Promise.all([p.waitForEvent("filechooser"), p.getByRole("button", { name: /Importar legendas/ }).click()]);
  await s.setFiles(path.join(FIX, "cena-teste.srt"));
  await p.getByLabel("Título").fill(titulo);
}
(async () => {
  const nav = await chromium.launch();
  const p = await (await nav.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await entrarAdmin(p, BASE);
  // Caiu 2 vezes: na 3ª tentativa vai.
  await novaCena(p, "Internet caiu 2 vezes");
  await falhar(2);
  await p.getByRole("button", { name: /Salvar cena/ }).click();
  await p.getByRole("heading", { name: "Administração" }).waitFor({ timeout: 120000 });
  await esperarFila(p);
  const salvou = (await (await fetch(`${SERVIDOR}/__estado`)).json()).cenas.some((c) => c.titulo === "Internet caiu 2 vezes");
  console.log("Internet caiu 2 vezes no envio e o app salvou sozinho na 3ª tentativa:", salvou ? "ok" : "FALHOU");
  // Caiu de vez: a fila mostra o motivo, guarda tudo no aparelho e tenta de novo sozinha quando a internet volta.
  await novaCena(p, "Internet caiu de vez");
  await falhar(99);
  await p.getByRole("button", { name: /Salvar cena/ }).click();
  await p.getByRole("heading", { name: "Administração" }).waitFor({ timeout: 20000 });
  await p.locator("#processamento li.erro").getByText(/Sem conexão/).waitFor({ timeout: 120000 });
  console.log("Sem internet de vez: o painel explica e oferece “Tentar de novo”:", (await p.getByRole("button", { name: /Tentar de novo/ }).count()) ? "ok" : "FALHOU");
  await falhar(0);
  await p.getByRole("button", { name: /Tentar de novo/ }).click();
  await esperarFila(p);
  const depois = (await (await fetch(`${SERVIDOR}/__estado`)).json()).cenas.some((c) => c.titulo === "Internet caiu de vez");
  console.log("Com a internet de volta, “Tentar de novo” salva a cena:", depois ? "ok" : "FALHOU");
  await nav.close();
})().catch((e) => { console.error("FALHOU:", e); process.exit(1); });
