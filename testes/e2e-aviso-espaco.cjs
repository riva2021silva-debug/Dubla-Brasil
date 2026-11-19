// Aviso de espaço (versão 4.5): quando os arquivos passam de 70% do limite do plano, o administrador vê
// "🧹" no botão Admin, um aviso no topo da Administração e um aviso nas Notificações. Usuário comum não vê nada.
const { chromium } = require("playwright");
const { entrarAdmin } = require("./auxiliar.cjs");
const BASE = process.argv[2] || "http://localhost:4174/";
const S = "http://localhost:54399";
(async () => {
  const nav = await chromium.launch();
  const p = await (await nav.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const erros = [];
  p.on("pageerror", (e) => erros.push(String(e)));
  await entrarAdmin(p, BASE);
  const semAviso = (await p.locator(".aviso-espaco").count()) === 0;
  console.log("Servidor vazio: sem aviso:", semAviso ? "ok" : "FALHOU");
  // Finge que as cenas ocupam 800 MB (78% de 1 GB).
  await fetch(`${S}/storage/v1/object/midias/cenas/x/v.mp4`, { method: "POST", headers: { Authorization: "Bearer token-admin-de-teste", "Content-Type": "video/mp4" }, body: Buffer.alloc(100) });
  await fetch(`${S}/__espaco-extra?pasta=midias&bytes=${800 * 1024 * 1024}`);
  await p.goto(BASE + "#/cenas");
  await p.reload();
  await p.goto(BASE + "#/admin");
  await p.locator(".aviso-espaco").waitFor({ timeout: 15000 });
  const texto = await p.locator(".aviso-espaco").innerText();
  console.log("Aviso no topo da Administração com a porcentagem:", /78%/.test(texto) ? "ok" : `FALHOU (${texto})`);
  const botao = await p.locator(".atalhos-topo a[href*='admin'], .nav a[href*='admin']").first().getAttribute("aria-label").catch(() => "");
  const marca = (await p.getByRole("link", { name: /hora de liberar espaço/ }).count()) > 0;
  console.log("Botão Admin com a marca 🧹:", marca ? "ok" : `FALHOU (${botao})`);
  await p.screenshot({ path: "testes/saida/aviso-espaco.png" });
  await p.getByRole("button", { name: "🧹 Liberar espaço" }).click();
  await p.getByRole("button", { name: /Ver quais seriam apagados/ }).waitFor();
  console.log("“Liberar espaço” leva direto para a limpeza da Galeria: ok");
  await p.goto(BASE + "#/notificacoes");
  await p.getByText("Hora de liberar espaço no servidor").waitFor();
  console.log("Aviso também nas Notificações do administrador: ok");
  // Plano Pro (100 GB): 800 MB é pouco, o aviso some.
  await p.goto(BASE + "#/admin");
  await p.locator(".aviso-espaco select").selectOption("pro");
  await p.locator(".aviso-espaco").waitFor({ state: "detached", timeout: 15000 });
  console.log("Trocando o plano para Pro (100 GB) o aviso some: ok");
  // Usuário comum: nada de aviso.
  const u = await (await nav.newContext({ viewport: { width: 400, height: 800 } })).newPage();
  await u.goto(BASE + "#/notificacoes");
  await u.waitForTimeout(2500);
  console.log("Usuário comum não vê o aviso:", (await u.getByText("Hora de liberar espaço").count()) === 0 ? "ok" : "FALHOU");
  console.log(erros.length ? "ERROS:\n" + erros.join("\n") : "Sem erros no console.");
  await nav.close();
})().catch((e) => { console.error("FALHOU:", e); process.exit(1); });
