// Servidor que imita o Supabase (login, tabelas com as mesmas regras de permissão e pasta de arquivos),
// para os testes automáticos não mexerem no projeto real. Uso: node testes/servidor-falso.cjs [porta]
const http = require("http");
const { URL } = require("url");

const PORTA = Number(process.argv[2] || 54399);
const ADMIN = { id: "00000000-0000-4000-8000-000000000001", email: "admin@teste.dev", senha: "senha-de-teste-123" };
const TOKEN_ADMIN = "token-admin-de-teste";
const tabelas = { cenas: new Map(), sons: new Map() };
const arquivos = new Map(); // caminho -> { tipo, dados }

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD",
  "Access-Control-Expose-Headers": "Content-Range, Content-Length, Accept-Ranges",
};

function responder(res, status, corpo, cabecalhos = {}) {
  const json = corpo === undefined ? "" : JSON.stringify(corpo);
  res.writeHead(status, { ...CORS, "Content-Type": "application/json", ...cabecalhos });
  res.end(json);
}

function lerCorpo(req) {
  return new Promise((ok) => {
    const partes = [];
    req.on("data", (p) => partes.push(p));
    req.on("end", () => ok(Buffer.concat(partes)));
  });
}

const ehAdmin = (req) => (req.headers.authorization || "") === `Bearer ${TOKEN_ADMIN}`;
const usuario = { id: ADMIN.id, email: ADMIN.email, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };

function filtrar(linhas, params) {
  let r = [...linhas];
  for (const [k, v] of params) {
    if (["select", "order", "limit", "on_conflict", "columns"].includes(k)) continue;
    if (v.startsWith("eq.")) {
      const alvo = v.slice(3);
      r = r.filter((l) => String(l[k]) === alvo);
    }
  }
  const ordem = params.get("order");
  if (ordem) {
    const [col, dir] = ordem.split(".");
    r.sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0) * (dir === "desc" ? -1 : 1));
  }
  return r;
}

function multipart(corpo, tipo) {
  const m = /boundary=(.+)$/.exec(tipo || "");
  if (!m) return null;
  const limite = Buffer.from("--" + m[1]);
  let i = corpo.indexOf(limite);
  while (i !== -1) {
    const fimCab = corpo.indexOf("\r\n\r\n", i);
    if (fimCab === -1) break;
    const cab = corpo.slice(i, fimCab).toString();
    const prox = corpo.indexOf(limite, fimCab);
    const dados = corpo.slice(fimCab + 4, prox - 2);
    if (/filename=|name=""/.test(cab) || /Content-Type:/i.test(cab)) {
      const ct = /Content-Type:\s*([^\r\n]+)/i.exec(cab);
      if (dados.length > 0 || ct) return { dados, tipo: ct ? ct[1].trim() : "application/octet-stream" };
    }
    i = prox;
  }
  return null;
}

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORTA}`);
  const p = url.pathname;
  if (req.method === "OPTIONS") return responder(res, 204);
  const corpo = await lerCorpo(req);
  const json = () => (corpo.length ? JSON.parse(corpo.toString()) : {});

  // ----- Login -----
  if (p === "/auth/v1/token" && req.method === "POST") {
    const { email, password } = json();
    if (email === ADMIN.email && password === ADMIN.senha)
      return responder(res, 200, { access_token: TOKEN_ADMIN, token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: "r", user: usuario });
    return responder(res, 400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
  }
  if (p === "/auth/v1/user") {
    if (!ehAdmin(req)) return responder(res, 401, { msg: "JWT expired" });
    return responder(res, 200, usuario);
  }
  if (p === "/auth/v1/logout") return responder(res, 204);

  // ----- Funções -----
  if (p === "/rest/v1/rpc/eh_admin") return responder(res, 200, ehAdmin(req));

  // ----- Tabelas (com as mesmas regras de permissão do esquema.sql) -----
  const t = /^\/rest\/v1\/(cenas|sons)$/.exec(p);
  if (t) {
    const tabela = tabelas[t[1]];
    const umSo = (req.headers.accept || "").includes("vnd.pgrst.object");
    const visiveis = () => filtrar([...tabela.values()].filter((l) => l.publicada || ehAdmin(req)), url.searchParams);
    const entregar = (linhas) => {
      if (!umSo) return responder(res, 200, linhas);
      if (linhas.length !== 1) return responder(res, 406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" });
      return responder(res, 200, linhas[0]);
    };
    if (req.method === "GET" || req.method === "HEAD") return entregar(visiveis());
    if (!ehAdmin(req)) return responder(res, 403, { code: "42501", message: `new row violates row-level security policy for table "${t[1]}"` });
    const agora = new Date().toISOString();
    if (req.method === "POST") {
      const linhas = [].concat(json()).map((l) => {
        const antes = tabela.get(l.id);
        const nova = { criada_em: agora, ...antes, ...l, atualizada_em: agora };
        tabela.set(l.id, nova);
        return nova;
      });
      return entregar(linhas);
    }
    if (req.method === "PATCH") {
      const alvo = filtrar([...tabela.values()], url.searchParams);
      alvo.forEach((l) => tabela.set(l.id, { ...l, ...json(), atualizada_em: agora }));
      return responder(res, 204);
    }
    if (req.method === "DELETE") {
      filtrar([...tabela.values()], url.searchParams).forEach((l) => tabela.delete(l.id));
      return responder(res, 204);
    }
  }

  // ----- Pasta de arquivos -----
  const pub = /^\/storage\/v1\/object\/public\/midias\/(.+)$/.exec(p);
  if (pub) {
    const a = arquivos.get(decodeURIComponent(pub[1]));
    if (!a) return responder(res, 400, { statusCode: "404", error: "not_found", message: "Object not found" });
    const total = a.dados.length;
    const faixa = /bytes=(\d*)-(\d*)/.exec(req.headers.range || "");
    if (faixa) {
      const ini = faixa[1] ? Number(faixa[1]) : 0;
      const fim = faixa[2] ? Math.min(Number(faixa[2]), total - 1) : total - 1;
      res.writeHead(206, { ...CORS, "Content-Type": a.tipo, "Accept-Ranges": "bytes", "Content-Range": `bytes ${ini}-${fim}/${total}`, "Content-Length": fim - ini + 1 });
      return res.end(req.method === "HEAD" ? undefined : a.dados.slice(ini, fim + 1));
    }
    res.writeHead(200, { ...CORS, "Content-Type": a.tipo, "Accept-Ranges": "bytes", "Content-Length": total });
    return res.end(req.method === "HEAD" ? undefined : a.dados);
  }
  const obj = /^\/storage\/v1\/object\/midias\/(.+)$/.exec(p);
  if (obj && req.method === "POST") {
    if (!ehAdmin(req)) return responder(res, 403, { statusCode: "403", error: "Unauthorized", message: "new row violates row-level security policy" });
    const parte = multipart(corpo, req.headers["content-type"]);
    const dados = parte ? parte.dados : corpo;
    const tipo = parte ? parte.tipo : req.headers["content-type"];
    if (dados.length > 50 * 1024 * 1024) return responder(res, 413, { statusCode: "413", error: "Payload too large", message: "The object exceeded the maximum allowed size" });
    const caminho = decodeURIComponent(obj[1]);
    arquivos.set(caminho, { tipo, dados });
    return responder(res, 200, { Key: `midias/${caminho}`, Id: caminho });
  }
  if (p === "/storage/v1/object/midias" && req.method === "DELETE") {
    if (!ehAdmin(req)) return responder(res, 403, { message: "Unauthorized" });
    const { prefixes = [] } = json();
    prefixes.forEach((c) => arquivos.delete(c));
    return responder(res, 200, prefixes.map((name) => ({ name })));
  }

  // ----- Inspeção para os testes -----
  if (p === "/__estado") return responder(res, 200, { cenas: [...tabelas.cenas.values()], sons: [...tabelas.sons.values()], arquivos: [...arquivos.keys()] });

  responder(res, 404, { message: `rota não simulada: ${req.method} ${p}` });
});

servidor.listen(PORTA, () => console.log(`servidor falso na porta ${PORTA}`));
module.exports = { ADMIN };
