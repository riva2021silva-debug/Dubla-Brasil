// Teste da organização por turnos (versão 3.8). Rode: node --experimental-strip-types testes/unidade-turnos.mjs
import { organizarPorTurnos } from "../src/transcricao/vozes.ts";
const f = (id, p, a, b, t) => ({ id, personagemId: p, inicioMs: a, fimMs: b, texto: t });
const r = organizarPorTurnos([
  f("1", "homem", 1000, 2000, "Iai,"), f("2", "homem", 2400, 3600, "reconhece alguns desses homens?"), // mesma pessoa, pausa curta
  f("3", "mulher", 4000, 5200, "Acho que o número dois."),
  f("4", "homem", 5000, 6500, "Tem certeza?"), // começou por cima dela
  f("5", "mulher", 7000, 8000, "Tenho."),
]);
r.forEach((t) => console.log(`${t.personagemId.padEnd(6)} ${t.inicioMs}-${t.fimMs} "${t.texto}"`));
const ok =
  r.length === 4 &&
  r[0].texto === "Iai, reconhece alguns desses homens?" && r[0].fimMs === 3920 && // vai até a mulher começar
  r[1].fimMs === 4920 && // não passa por cima do homem
  r[2].fimMs === 6920 &&
  r.every((t, i) => i === 0 || t.inicioMs >= r[i - 1].fimMs);
console.log("Turnos: homem → mulher → homem → mulher, um depois do outro, sem buraco e sem invadir:", ok ? "ok" : "FALHOU");
