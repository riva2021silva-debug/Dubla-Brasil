// Teste do detector de voz (versão 3.6). Rode: node --experimental-strip-types testes/unidade-vozes.mjs
import { detectarFala, trechosSemFala } from "../src/transcricao/vozes.ts";
const taxa = 16000, dur = 10;
const n = taxa * dur;
const esq = new Float32Array(n), dir = new Float32Array(n);
let semente = 7; const rnd = () => ((semente = (semente * 16807) % 2147483647) / 2147483647) * 2 - 1;
const vozes = [[1000, 2000], [3000, 3500], [6000, 8000]];
for (let i = 0; i < n; i++) {
  const t = i / taxa, ms = t * 1000;
  const musica = 0.15 * Math.sin(2 * Math.PI * 330 * t) + 0.05 * rnd(); // música só na esquerda
  let voz = 0;
  if (vozes.some(([a, b]) => ms >= a && ms < b)) {
    // "Voz": fundamental de 150 Hz com harmônicos até ~3 kHz, sílabas de 4 por segundo.
    for (let k = 1; k <= 20; k++) voz += Math.sin(2 * Math.PI * 150 * k * t) / k;
    voz *= 0.12 * (0.55 + 0.45 * Math.sin(2 * Math.PI * 4 * t));
  }
  esq[i] = musica + voz;
  dir[i] = voz + 0.02 * rnd();
}

const achadas = detectarFala(esq, dir, taxa);
console.log("Estéreo — falas detectadas:", achadas.map((t) => `${t.inicioMs}-${t.fimMs}`).join(", "));
const ok = vozes.every(([a, b]) => achadas.some((t) => Math.abs(t.inicioMs - a) <= 200 && Math.abs(t.fimMs - b) <= 200)) && achadas.length === 3;
console.log("Achou as 3 vozes do centro (±0,2 s) e ignorou a música dos lados:", ok ? "ok" : "FALHOU");
const buracos = trechosSemFala(achadas, [{ inicioMs: 1000, fimMs: 2000 }, { inicioMs: 6000, fimMs: 8000 }]);
console.log("Com falas marcadas só em 1–2 s e 6–8 s, buraco encontrado:", buracos.map((t) => `${t.inicioMs}-${t.fimMs}`).join(", "), buracos.length === 1 && Math.abs(buracos[0].inicioMs - 3000) <= 250 ? "ok" : "FALHOU");
// Mono: sem lados, usa só a força do som.
const mono = new Float32Array(n);
for (let i = 0; i < n; i++) mono[i] = (vozes.some(([a, b]) => (i / taxa) * 1000 >= a && (i / taxa) * 1000 < b) ? 0.3 : 0.01) * rnd();
const m = detectarFala(mono, mono, taxa);
console.log("Mono — falas detectadas:", m.map((t) => `${t.inicioMs}-${t.fimMs}`).join(", "), m.length === 3 ? "ok" : "FALHOU");
