// "🧹 Liberar espaço" (versão 4.5): apaga só os dubs com mais de 60 dias e até 2 curtidas, depois de mostrar a lista
// e o administrador confirmar. Dub antigo com muitas curtidas e dub novo ficam.
const { chromium } = require("playwright");
const { entrarAdmin } = require("./auxiliar.cjs");
const BASE = process.argv[2] || "http://localhost:4174/";
const S = "http://localhost:54399";
const ADM = { Authorization: "Bearer token-admin-de-teste", "Content-Type": "application/json" };
const estado = async () => (await fetch(`${S}/__estado`)).json();

(async () => {
  // Uma pessoa publica 3 dubs (direto pela API do servidor de teste).
  const ses = await (await fetch(`${S}/auth/v1/signup`, { method: "POST", body: JSON.stringify({}) })).json();
  const H = { Authorization: `Bearer ${ses.access_token}`, "Content-Type": "application/json" };
  const uid = ses.user.id;
  await fetch(`${S}/rest/v1/perfis`, { method: "POST", headers: H, body: JSON.stringify({ user_id: uid, apelido: "Fulana" }) });
  const ids = {};
  for (const nome of ["antigo-sem-curtida", "antigo-famoso", "novo-sem-curtida"]) {
    const caminho = `${uid}/${nome}.mp4`;
    await fetch(`${S}/storage/v1/object/dubs/${caminho}`, { method: "POST", headers: { Authorization: H.Authorization, "Content-Type": "video/mp4" }, body: Buffer.alloc(1000) });
    const r = await fetch(`${S}/rest/v1/publicacoes`, { method: "POST", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify({ cena_titulo: nome, papeis: [], video_path: caminho, duracao_ms: 1000 }) });
    ids[nome] = (await r.json())[0].id;
  }
  const velho = new Date(Date.now() - 90 * 86400000).toISOString();
  await fetch(`${S}/rest/v1/publicacoes?id=eq.${ids["antigo-sem-curtida"]}`, { method: "PATCH", headers: ADM, body: JSON.stringify({ criada_em: velho }) });
  await fetch(`${S}/rest/v1/publicacoes?id=eq.${ids["antigo-famoso"]}`, { method: "PATCH", headers: ADM, body: JSON.stringify({ criada_em: velho, curtidas: 12 }) });

  const nav = await chromium.launch();
  const p = await (await nav.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const erros = [];
  p.on("pageerror", (e) => erros.push(String(e)));
  await entrarAdmin(p, BASE);
  await p.getByRole("tab", { name: /Galeria/ }).click();
  await p.getByRole("button", { name: /Ver quais seriam apagados/ }).click();
  await p.getByRole("button", { name: /Apagar 1 dub/ }).waitFor();
  const lista = await p.locator('[aria-label="Dubs que seriam apagados"]').innerText();
  console.log("Mostra antes só o dub antigo sem curtidas:", /antigo-sem-curtida/.test(lista) && !/famoso|novo/.test(lista) ? "ok" : `FALHOU (${lista})`);
  const antes = await estado();
  console.log("Nada apagado antes de confirmar:", antes.publicacoes.length === 3 ? "ok" : "FALHOU");
  await p.getByRole("button", { name: /Apagar 1 dub/ }).click();
  await p.getByText(/1 dub apagado/).waitFor();
  const depois = await estado();
  const restam = depois.publicacoes.map((x) => x.cena_titulo).sort().join(",");
  console.log("Apagou só ele (antigo famoso e novo ficaram):", restam === "antigo-famoso,novo-sem-curtida" ? "ok" : `FALHOU (${restam})`);
  console.log("Arquivo do vídeo apagado do servidor:", !depois.arquivos.some((a) => a.includes("antigo-sem-curtida")) && depois.arquivos.some((a) => a.includes("antigo-famoso")) ? "ok" : "FALHOU");
  console.log(erros.length ? "ERROS:\n" + erros.join("\n") : "Sem erros no console.");
  await nav.close();
})().catch((e) => { console.error("FALHOU:", e); process.exit(1); });
