// Nota da dublagem (versão 5.8): falar junto com o personagem dá nota alta; atrasado, mudo ou fora de hora, nota baixa.
import { notaDaDublagem } from "../src/audio/notaDublagem.ts";
const T = 16000;
// "Fala" com sílabas: 220 ms de som, 80 ms de pausa, de deMs até ateMs (dentro de um áudio de durMs).
const fala = (durMs, deMs, ateMs, amp = 0.3, hz = 200) => {
  const a = new Float32Array(Math.round((durMs / 1000) * T));
  for (let i = 0; i < a.length; i++) {
    const ms = (i / T) * 1000;
    if (ms >= deMs && ms < ateMs && (ms - deMs) % 300 < 220) a[i] = amp * Math.sin((2 * Math.PI * hz * i) / T);
  }
  return a;
};
const original = fala(6000, 1000, 4000); // personagem fala de 1 s a 4 s
const caso = (nome, tomada, inicio, cond) => {
  const n = notaDaDublagem({ original, taxaOriginal: T, tomada, taxaTomada: T, tomadaInicioMs: inicio, inicioMs: 800, fimMs: 4300 });
  console.log(`${nome}: ${n}`, cond(n) ? "ok" : "FALHOU");
  return cond(n);
};
let ok = true;
// A tomada começa em 550 ms da cena (o app grava com folga antes da fala).
ok &= caso("Falou junto com o personagem", fala(4000, 450, 3450, 0.25, 140), 550, (n) => n >= 85);
ok &= caso("Falou com 1 s de atraso", fala(4000, 1450, 3750, 0.25, 140), 550, (n) => n < 70);
ok &= caso("Falou só a metade", fala(4000, 450, 1950, 0.25, 140), 550, (n) => n < 75);
ok &= caso("Ficou mudo", new Float32Array(4000 * 16), 550, (n) => n === 0);
ok &= caso("Falou baixinho, mas no tempo", fala(4000, 450, 3450, 0.04, 140), 550, (n) => n >= 60 && n < 95);
// Sílabas em outro ritmo (outra pessoa, outras palavras), mas no tempo certo: nota boa, não perfeita.
const outroRitmo = (() => { const a = new Float32Array(4000 * 16); for (let i = 0; i < a.length; i++) { const ms = (i / T) * 1000; if (ms >= 450 && ms < 3450 && (ms - 450) % 410 < 300) a[i] = 0.25 * Math.sin((2 * Math.PI * 150 * i) / T); } return a; })();
ok &= caso("Falou no tempo, com outras palavras", outroRitmo, 550, (n) => n >= 70);
const zumbido = new Float32Array(4000 * 16).map((_, i) => 0.25 * Math.sin((2 * Math.PI * 120 * i) / T));
ok &= caso("Zumbido constante o tempo todo", zumbido, 550, (n) => n < 80);
process.exit(ok ? 0 : 1);
