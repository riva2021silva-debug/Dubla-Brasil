// Teste da divisão de falas grudadas (versão 3.6). Rode: node --experimental-strip-types testes/unidade-dividir.mjs
import { dividirPorPausas } from "../src/transcricao/vozes.ts";
// O Whisper juntou "Oi! Tudo bem com você?" (0–4 s), mas há duas vozes: 0,2–0,9 s e 1,6–3,9 s.
const r = dividirPorPausas(
  [{ inicioMs: 0, fimMs: 4000, texto: "Oi! Tudo bem com você?", original: "Hi! How are you doing?" }],
  [{ inicioMs: 200, fimMs: 900 }, { inicioMs: 1600, fimMs: 3900 }],
);
console.log(r.map((p) => `${p.inicioMs}-${p.fimMs} "${p.texto}" (${p.original})`).join(" | "));
console.log("Dividiu em 2 falas na pausa:", r.length === 2 && r[0].texto === "Oi!" && r[1].texto === "Tudo bem com você?" && r[0].fimMs <= r[1].inicioMs ? "ok" : "FALHOU");
// Uma voz só: não divide.
const u = dividirPorPausas([{ inicioMs: 0, fimMs: 3000, texto: "Uma fala só", original: "" }], [{ inicioMs: 100, fimMs: 2900 }]);
console.log("Fala sem pausa continua inteira:", u.length === 1 ? "ok" : "FALHOU");
