// Teste: a IA repete "ah, ah, ah…" dezenas de vezes; o texto fica com 3 + "…".
import { limparRepeticoes } from "../src/transcricao/vozes.ts";
const casos = [
  ["ah, ah, ah, ah, ah, ah, ah, ah, ah, ah, ah, ah,", "ah, ah, ah…"],
  ["Socorro! Ah, ah, ah, ah, ah, ah. Me ajuda!", "Socorro! Ah, ah, ah… Me ajuda!"],
  ["la la la la la la la la", "la la la…"],
  ["eu te amo eu te amo eu te amo eu te amo eu te amo", "eu te amo eu te amo eu te amo…"],
  ["Não, não, não! Eu já disse.", "Não, não, não! Eu já disse."],
  ["Olá, Jack. Tudo bem?", "Olá, Jack. Tudo bem?"],
];
let ok = true;
for (const [entrada, esperado] of casos) {
  const r = limparRepeticoes(entrada);
  if (r !== esperado) { ok = false; console.log("FALHOU:", JSON.stringify(entrada), "→", JSON.stringify(r), "(esperado", JSON.stringify(esperado) + ")"); }
}
console.log("Repetições da IA viram 3 + “…”, frases normais ficam iguais:", ok ? "ok" : "FALHOU");
