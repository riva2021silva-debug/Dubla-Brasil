// Servidor que imita o Supabase (login, tabelas com as mesmas regras de permissão dos arquivos .sql e as pastas
// de arquivos), para os testes automáticos não mexerem no projeto real. Uso: node testes/servidor-falso.cjs [porta]
const http = require("http");
const crypto = require("crypto");
const { URL } = require("url");

const PORTA = Number(process.argv[2] || 54399);
const ADMIN = { id: "00000000-0000-4000-8000-000000000001", email: "admin@teste.dev", senha: "senha-de-teste-123" };
const TOKEN_ADMIN = "token-admin-de-teste";
const usuarios = new Map([[TOKEN_ADMIN, { id: ADMIN.id, email: ADMIN.email, admin: true }]]);
const assinantes = new Map(); // user_id -> { premium_ate, origem }
const uso = new Map(); // user_id + dia -> dublagens
const usuarioPorId = (id) => [...usuarios.values()].find((x) => x.id === id);
const arquivos = new Map(); // "pasta/caminho" -> { tipo, dados }
const dados = { cenas: new Map(), sons: new Map(), perfis: new Map(), publicacoes: new Map(), reacoes: new Map(), comentarios: new Map(), denuncias: new Map(), mensagens_ajuda: new Map(), notificacoes: new Map() };

const temPerfil = (u) => !!u.id && dados.perfis.has(u.id);
const regras = {
  cenas: { pk: ["id"], ler: (l, u) => l.publicada || u.admin, inserir: (l, u) => u.admin, atualizar: (l, u) => u.admin, apagar: (l, u) => u.admin },
  sons: { pk: ["id"], ler: (l, u) => l.publicada || u.admin, inserir: (l, u) => u.admin, atualizar: (l, u) => u.admin, apagar: (l, u) => u.admin },
  perfis: {
    pk: ["user_id"],
    padrao: (u) => ({ user_id: u.id, criado_em: agora() }),
    ler: () => true,
    inserir: (l, u) => !!u.id && l.user_id === u.id,
    atualizar: (l, u) => l.user_id === u.id,
    apagar: () => false,
    validar: (l) => {
      if (l.foto_path && !String(l.foto_path).startsWith(l.user_id + "/avatar-")) return 'new row for relation "perfis" violates check constraint "foto_na_propria_pasta"';
      if (!/^[A-Za-z0-9_.À-ÿ]{3,20}$/.test(l.apelido || "")) return 'new row for relation "perfis" violates check constraint "apelido_caracteres"';
      for (const o of dados.perfis.values()) if (o.user_id !== l.user_id && o.apelido.toLowerCase() === l.apelido.toLowerCase()) return 'duplicate key value violates unique constraint "perfis_apelido_unico"';
      return null;
    },
  },
  publicacoes: {
    pk: ["id"],
    padrao: (u) => ({ id: crypto.randomUUID(), autor_id: u.id, oculta: false, curtidas: 0, descurtidas: 0, comentarios: 0, denuncias: 0, papeis: [], capa_path: null, dueto_de: null, criada_em: agora() }),
    ler: (l, u) => !l.oculta || l.autor_id === u.id || u.admin,
    inserir: (l, u) => !!u.id && l.autor_id === u.id && temPerfil(u) && !l.oculta && !l.curtidas && !l.descurtidas && !l.comentarios && !l.denuncias,
    atualizar: (l, u) => u.admin,
    apagar: (l, u) => l.autor_id === u.id || u.admin,
  },
  reacoes: {
    pk: ["publicacao_id", "user_id"],
    padrao: (u) => ({ user_id: u.id }),
    ler: (l, u) => l.user_id === u.id,
    inserir: (l, u) => !!u.id && l.user_id === u.id,
    atualizar: (l, u) => l.user_id === u.id,
    apagar: (l, u) => l.user_id === u.id,
  },
  comentarios: {
    pk: ["id"],
    padrao: (u) => ({ id: crypto.randomUUID(), autor_id: u.id, criado_em: agora() }),
    ler: () => true,
    inserir: (l, u) => l.autor_id === u.id && temPerfil(u) && (l.texto || "").trim().length >= 1 && l.texto.length <= 300,
    atualizar: () => false,
    apagar: (l, u) => l.autor_id === u.id || u.admin,
  },
  mensagens_ajuda: {
    pk: ["id"],
    padrao: (u) => ({ id: crypto.randomUUID(), user_id: u.id, status: "nova", resposta: null, respondida_em: null, contato: null, criada_em: agora() }),
    ler: (l, u) => l.user_id === u.id || u.admin,
    inserir: (l, u) =>
      !!u.id && l.user_id === u.id && l.status === "nova" && !l.resposta && (l.texto || "").trim().length >= 5 &&
      [...dados.mensagens_ajuda.values()].filter((m) => m.user_id === u.id).length < 5,
    atualizar: (l, u) => u.admin,
    apagar: (l, u) => u.admin,
  },
  // Notificações (supabase/dueto-e-notificacoes.sql): só os "gatilhos" criam; a pessoa lê, marca como lida e apaga as suas.
  notificacoes: {
    pk: ["id"],
    ler: (l, u) => !!u.id && l.para === u.id,
    inserir: () => false,
    atualizar: (l, u) => !!u.id && l.para === u.id,
    apagar: (l, u) => !!u.id && l.para === u.id,
  },
  denuncias: {
    pk: ["publicacao_id", "user_id"],
    padrao: (u) => ({ user_id: u.id, criada_em: agora() }),
    ler: (l, u) => l.user_id === u.id || u.admin,
    inserir: (l, u) => !!u.id && l.user_id === u.id,
    atualizar: () => false,
    apagar: () => false,
  },
};

let relogio = Date.now();
function agora() {
  relogio = Math.max(relogio + 1, Date.now()); // datas sempre crescentes (a ordem do feed fica estável)
  return new Date(relogio).toISOString();
}
const chave = (tabela, l) => regras[tabela].pk.map((k) => l[k]).join("|");

function contar(pubId) {
  const p = dados.publicacoes.get(pubId);
  if (!p) return;
  const r = [...dados.reacoes.values()].filter((x) => x.publicacao_id === pubId);
  p.curtidas = r.filter((x) => x.valor === 1).length;
  p.descurtidas = r.filter((x) => x.valor === -1).length;
  p.comentarios = [...dados.comentarios.values()].filter((x) => x.publicacao_id === pubId).length;
  p.denuncias = [...dados.denuncias.values()].filter((x) => x.publicacao_id === pubId).length;
}

// Imita os gatilhos do SQL: apelido do dueto vem do servidor; curtida, comentário e dueto avisam o dono do dub.
function antesDeInserir(tabela, l) {
  if (tabela !== "publicacoes") return;
  const orig = l.dueto_de ? dados.publicacoes.get(l.dueto_de) : null;
  const apelido = orig && !orig.oculta ? dados.perfis.get(orig.autor_id)?.apelido : null;
  l.dueto_de = apelido ? orig.id : null;
  l.dueto_apelido = apelido ?? null;
}
function notificar(tabela, l) {
  let quem, alvo, tipo;
  if (tabela === "reacoes" && l.valor === 1) [quem, alvo, tipo] = [l.user_id, l.publicacao_id, "curtida"];
  else if (tabela === "comentarios") [quem, alvo, tipo] = [l.autor_id, l.publicacao_id, "comentario"];
  else if (tabela === "publicacoes" && l.dueto_de) [quem, alvo, tipo] = [l.autor_id, l.dueto_de, "dueto"];
  else return;
  const pub = dados.publicacoes.get(alvo);
  if (!pub || pub.autor_id === quem) return;
  const pubAviso = tipo === "dueto" ? l.id : alvo;
  if (tipo === "curtida" && [...dados.notificacoes.values()].some((n) => n.tipo === "curtida" && n.para === pub.autor_id && n.de === quem && n.publicacao_id === alvo)) return;
  const n = { id: crypto.randomUUID(), para: pub.autor_id, de: quem, de_apelido: dados.perfis.get(quem)?.apelido ?? null, tipo, publicacao_id: pubAviso, cena_titulo: pub.cena_titulo, texto: tipo === "comentario" ? String(l.texto).slice(0, 120) : null, lida: false, criada_em: agora() };
  dados.notificacoes.set(n.id, n);
}

function apagarEmCascata(tabela, l) {
  if (tabela === "publicacoes") for (const t of ["reacoes", "comentarios", "denuncias"]) for (const [k, x] of dados[t]) if (x.publicacao_id === l.id) dados[t].delete(k);
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD",
  "Access-Control-Expose-Headers": "Content-Range, Content-Length, Accept-Ranges",
};
function responder(res, status, corpo, cab = {}) {
  res.writeHead(status, { ...CORS, "Content-Type": "application/json", ...cab });
  res.end(corpo === undefined ? "" : JSON.stringify(corpo));
}
const lerCorpo = (req) => new Promise((ok) => { const p = []; req.on("data", (d) => p.push(d)); req.on("end", () => ok(Buffer.concat(p))); });
const quem = (req) => usuarios.get((req.headers.authorization || "").replace("Bearer ", "")) || { id: null, admin: false };

function sessao(token, u) {
  return {
    access_token: token, token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: "r-" + token,
    user: { id: u.id, email: u.email ?? "", aud: "authenticated", role: "authenticated", is_anonymous: !u.email, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
  };
}

// ----- Consultas: filtros, ordem, limite e projeção (inclui "perfis(apelido)") -----
function filtrar(linhas, params) {
  let r = [...linhas];
  for (const [k, v] of params) {
    if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(k)) continue;
    const [op, ...resto] = v.split(".");
    const alvo = resto.join(".");
    if (op === "eq") r = r.filter((l) => String(l[k]) === alvo);
    else if (op === "lt") r = r.filter((l) => String(l[k]) < alvo);
    else if (op === "in") {
      const lista = alvo.replace(/^\(|\)$/g, "").split(",").map((s) => s.replace(/^"|"$/g, ""));
      r = r.filter((l) => lista.includes(String(l[k])));
    }
  }
  const ordem = params.get("order");
  if (ordem) {
    const crits = ordem.split(",").map((o) => o.split("."));
    r.sort((a, b) => {
      for (const [col, dir] of crits) {
        const c = a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0;
        if (c) return dir === "desc" ? -c : c;
      }
      return 0;
    });
  }
  const limite = params.get("limit");
  return limite ? r.slice(0, Number(limite)) : r;
}

function projetar(l, select) {
  if (!select) return { ...l };
  const campos = [];
  let nivel = 0, atual = "";
  for (const ch of select) {
    if (ch === "(") nivel++;
    if (ch === ")") nivel--;
    if (ch === "," && nivel === 0) { campos.push(atual.trim()); atual = ""; } else atual += ch;
  }
  if (atual.trim()) campos.push(atual.trim());
  const out = {};
  for (const c of campos) {
    if (c === "*") Object.assign(out, l);
    else if (c.startsWith("perfis(")) {
      const p = dados.perfis.get(l.autor_id);
      out.perfis = p ? { apelido: p.apelido, ...(c.includes("foto_path") ? { foto_path: p.foto_path ?? null } : {}) } : null;
    } else out[c] = l[c];
  }
  return out;
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
    const d = corpo.slice(fimCab + 4, prox - 2);
    const ct = /Content-Type:\s*([^\r\n]+)/i.exec(cab);
    if (ct && d.length > 0) return { dados: d, tipo: ct[1].trim() };
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
  const u = quem(req);

  // ----- Login -----
  if (p === "/auth/v1/token" && req.method === "POST") {
    const { email, password } = json();
    if (email === ADMIN.email && password === ADMIN.senha) return responder(res, 200, sessao(TOKEN_ADMIN, usuarios.get(TOKEN_ADMIN)));
    for (const [token, cu] of usuarios) if (cu.email === email && cu.senha === password) return responder(res, 200, sessao(token, cu));
    return responder(res, 400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
  }
  if (p === "/auth/v1/signup" && req.method === "POST") {
    const { email, password } = json();
    if (email && [...usuarios.values()].some((x) => x.email === email))
      return responder(res, 422, { code: 422, error_code: "user_already_exists", msg: "User already registered" });
    const novo = { id: crypto.randomUUID(), email: email || null, senha: password, admin: false };
    const token = "token-anon-" + novo.id;
    usuarios.set(token, novo);
    return responder(res, 200, sessao(token, novo));
  }
  if (p === "/auth/v1/user") return u.id ? responder(res, 200, sessao("x", u).user) : responder(res, 401, { msg: "JWT expired" });
  if (p === "/auth/v1/logout") return responder(res, 204);
  if (p === "/rest/v1/rpc/eh_admin") return responder(res, 200, !!u.admin);
  // ----- Assinatura (mesmas regras de supabase/assinatura.sql) -----
  const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  const premiumDe = (id) => !!id && (usuarioPorId(id)?.admin || (assinantes.get(id)?.premium_ate ?? "") > new Date().toISOString());
  if (p === "/rest/v1/rpc/meu_plano")
    return responder(res, 200, { premium: premiumDe(u.id), premium_ate: assinantes.get(u.id)?.premium_ate ?? null, usadas_hoje: uso.get(u.id + hoje) ?? 0, limite: 3 });
  if (p === "/rest/v1/rpc/usar_dublagem") {
    if (!u.id) return responder(res, 401, { message: "permission denied for function usar_dublagem" });
    if (premiumDe(u.id)) return responder(res, 200, { ok: true, premium: true, usadas: 0, limite: 3 });
    const n = uso.get(u.id + hoje) ?? 0;
    if (n >= 3) return responder(res, 200, { ok: false, premium: false, usadas: 3, limite: 3 });
    uso.set(u.id + hoje, n + 1);
    return responder(res, 200, { ok: true, premium: false, usadas: n + 1, limite: 3 });
  }
  if (p === "/rest/v1/rpc/admin_listar_pagamentos") return u.admin ? responder(res, 200, []) : responder(res, 400, { message: "Só o administrador pode fazer isso." });
  if (p === "/rest/v1/rpc/apagar_minha_conta") {
    if (!u.id) return responder(res, 401, { message: "permission denied for function apagar_minha_conta" });
    if (u.admin) return responder(res, 400, { message: "A conta do administrador não pode ser apagada pelo app." });
    for (const [token, x] of usuarios) if (x.id === u.id) usuarios.delete(token);
    dados.perfis.delete(u.id);
    assinantes.delete(u.id);
    return responder(res, 200, null);
  }
  if (p === "/rest/v1/rpc/admin_definir_premium" || p === "/rest/v1/rpc/admin_listar_assinantes") {
    if (!u.admin) return responder(res, 400, { message: "Só o administrador pode fazer isso." });
    if (p.endsWith("listar_assinantes"))
      return responder(res, 200, [...assinantes.entries()].map(([id, a]) => ({ user_id: id, email: usuarioPorId(id)?.email ?? null, apelido: dados.perfis.get(id)?.apelido ?? null, ...a })));
    const { busca, dias } = json();
    const b = busca.trim().toLowerCase().replace(/^@/, "");
    const alvo = [...usuarios.values()].find((x) => (x.email || "").toLowerCase() === b)?.id ?? [...dados.perfis.values()].find((x) => x.apelido.toLowerCase() === b)?.user_id;
    if (!alvo) return responder(res, 400, { message: "Ninguém encontrado com esse e-mail ou apelido." });
    if (dias <= 0) { assinantes.delete(alvo); return responder(res, 200, { user_id: alvo, premium_ate: null }); }
    const base = Math.max(Date.now(), new Date(assinantes.get(alvo)?.premium_ate ?? 0).getTime());
    assinantes.set(alvo, { premium_ate: new Date(base + dias * 864e5).toISOString(), origem: "manual" });
    return responder(res, 200, { user_id: alvo, premium_ate: assinantes.get(alvo).premium_ate });
  }

  // ----- Tabelas -----
  const t = /^\/rest\/v1\/([a-z_]+)$/.exec(p);
  if (t && regras[t[1]]) {
    const nome = t[1];
    const regra = regras[nome];
    const tabela = dados[nome];
    const prefer = req.headers.prefer || "";
    const umSo = (req.headers.accept || "").includes("vnd.pgrst.object");
    const select = url.searchParams.get("select");
    const entregar = (linhas, status = 200) => {
      const saida = linhas.map((l) => projetar(l, select));
      if (!umSo) return responder(res, status, saida, /count=exact/.test(prefer) ? { "Content-Range": `0-${Math.max(0, saida.length - 1)}/${saida.length}` } : {});
      if (saida.length !== 1) return responder(res, 406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" });
      return responder(res, status, saida[0]);
    };
    const visiveis = () => [...tabela.values()].filter((l) => regra.ler(l, u));

    if (req.method === "GET" || req.method === "HEAD") return entregar(filtrar(visiveis(), url.searchParams));

    if (req.method === "POST") {
      const upsert = prefer.includes("resolution=merge-duplicates");
      const novas = [];
      for (const entrada of [].concat(json())) {
        const base = regra.padrao ? regra.padrao(u) : {};
        const candidata = { ...base, ...entrada };
        const k = chave(nome, candidata);
        const antes = tabela.get(k);
        if (antes && !upsert) return responder(res, 409, { code: "23505", message: `duplicate key value violates unique constraint "${nome}_pkey"` });
        const linha = antes ? { ...antes, ...entrada, atualizada_em: agora() } : { criada_em: agora(), ...candidata, atualizada_em: agora() };
        if (!antes) antesDeInserir(nome, linha);
        const pode = antes ? regra.atualizar(antes, u) && regra.atualizar(linha, u) : regra.inserir(linha, u);
        if (!pode) return responder(res, 403, { code: "42501", message: `new row violates row-level security policy for table "${nome}"` });
        const problema = regra.validar ? regra.validar(linha) : null;
        if (problema) return responder(res, 409, { code: "23505", message: problema });
        novas.push(linha);
      }
      for (const l of novas) {
        tabela.set(chave(nome, l), l);
        if (l.publicacao_id) contar(l.publicacao_id);
        notificar(nome, l);
      }
      return prefer.includes("return=representation") ? entregar(novas, 201) : responder(res, 201);
    }
    if (req.method === "PATCH") {
      for (const l of filtrar(visiveis(), url.searchParams)) {
        const mudanca = json();
        if (nome === "notificacoes" && Object.keys(mudanca).some((k) => k !== "lida")) return responder(res, 403, { code: "42501", message: "permission denied for table notificacoes" });
        const nova = { ...l, ...mudanca };
        if (regra.atualizar(l, u) && regra.atualizar(nova, u)) tabela.set(chave(nome, l), nova);
      }
      return responder(res, 204);
    }
    if (req.method === "DELETE") {
      for (const l of filtrar(visiveis(), url.searchParams))
        if (regra.apagar(l, u)) {
          tabela.delete(chave(nome, l));
          apagarEmCascata(nome, l);
          if (l.publicacao_id) contar(l.publicacao_id);
        }
      return responder(res, 204);
    }
  }

  // ----- Pastas de arquivos ("midias": só admin; "dubs": cada pessoa na própria pasta) -----
  const pub = /^\/storage\/v1\/object\/public\/(midias|dubs)\/(.+)$/.exec(p);
  if (pub) {
    const a = arquivos.get(`${pub[1]}/${decodeURIComponent(pub[2])}`);
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
  const podeEscrever = (pasta, caminho) => (pasta === "midias" ? u.admin : !!u.id && caminho.split("/")[0] === u.id);
  const podeApagar = (pasta, caminho) => (pasta === "midias" ? u.admin : u.admin || (!!u.id && caminho.split("/")[0] === u.id));
  const obj = /^\/storage\/v1\/object\/(midias|dubs)\/(.+)$/.exec(p);
  if (obj && req.method === "POST") {
    const caminho = decodeURIComponent(obj[2]);
    if (!podeEscrever(obj[1], caminho)) return responder(res, 403, { statusCode: "403", error: "Unauthorized", message: "new row violates row-level security policy" });
    const parte = multipart(corpo, req.headers["content-type"]);
    const d = parte ? parte.dados : corpo;
    const limite = obj[1] === "dubs" ? 15 : 50;
    if (d.length > limite * 1024 * 1024) return responder(res, 413, { statusCode: "413", error: "Payload too large", message: "The object exceeded the maximum allowed size" });
    arquivos.set(`${obj[1]}/${caminho}`, { tipo: parte ? parte.tipo : req.headers["content-type"], dados: d });
    return responder(res, 200, { Key: `${obj[1]}/${caminho}`, Id: caminho });
  }
  const del = /^\/storage\/v1\/object\/(midias|dubs)$/.exec(p);
  if (del && req.method === "DELETE") {
    const { prefixes = [] } = json();
    const apagados = prefixes.filter((c) => podeApagar(del[1], c));
    apagados.forEach((c) => arquivos.delete(`${del[1]}/${c}`));
    return responder(res, 200, apagados.map((name) => ({ name })));
  }

  // ----- Inspeção para os testes -----
  if (p === "/__estado")
    return responder(res, 200, {
      cenas: [...dados.cenas.values()], sons: [...dados.sons.values()], perfis: [...dados.perfis.values()],
      publicacoes: [...dados.publicacoes.values()], comentarios: [...dados.comentarios.values()],
      reacoes: [...dados.reacoes.values()], denuncias: [...dados.denuncias.values()], arquivos: [...arquivos.keys()],
      notificacoes: [...dados.notificacoes.values()],
    });

  responder(res, 404, { message: `rota não simulada: ${req.method} ${p}` });
});

servidor.listen(PORTA, () => console.log(`servidor falso na porta ${PORTA}`));
