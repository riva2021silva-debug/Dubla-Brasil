import { useState } from "react";
import { blobDaMidia } from "../db";
import { mensagemDeErro, salvarCena } from "../nuvem";
import { comprimirAudio, diagnosticar, otimizarVideo, podeOtimizar } from "../otimizarVideo";
import type { Cena } from "../tipos";

type Estado = { titulo: string; texto: string; tipo: "ok" | "feito" | "erro" | "andando" };

/**
 * Admin: confere o vídeo de cada cena e refaz os que travam no estúdio (fragmentados, índice no fim ou com poucos
 * quadros-chave). As falas não mudam; só o arquivo do vídeo é trocado no servidor.
 */
export default function OtimizarCenas({ cenas, aoTerminar }: { cenas: Cena[]; aoTerminar: () => void }) {
  const [rodando, setRodando] = useState(false);
  const [estados, setEstados] = useState<Estado[]>([]);
  const comVideo = cenas.filter((c) => c.caminhos?.video);
  if (!comVideo.length) return null;

  const rodar = async () => {
    setRodando(true);
    const lista: Estado[] = comVideo.map((c) => ({ titulo: c.titulo.trim(), texto: "esperando…", tipo: "andando" }));
    setEstados([...lista]);
    const mudar = (i: number, e: Partial<Estado>) => {
      lista[i] = { ...lista[i], ...e };
      setEstados([...lista]);
    };
    let trocou = false;
    for (let i = 0; i < comVideo.length; i++) {
      const c = comVideo[i];
      try {
        mudar(i, { texto: "baixando o vídeo…" });
        const video = await blobDaMidia(c.video);
        mudar(i, { texto: "conferindo…" });
        const d = await diagnosticar(video);
        // Trilha de fundo em WAV (enorme): comprime para M4A.
        let fundoNovo: Blob | null = null;
        if (c.fundo && c.caminhos?.fundo?.toLowerCase().endsWith(".wav")) {
          mudar(i, { texto: "🎵 comprimindo a trilha de fundo…" });
          const m4a = await comprimirAudio(await blobDaMidia(c.fundo)).catch(() => null);
          if (m4a) fundoNovo = new File([m4a], "fundo.m4a", { type: "audio/mp4" });
        }
        let novo: Blob | null = null;
        if (d.motivos.length) {
          novo = await otimizarVideo(video, (f) => mudar(i, { texto: `⚡ otimizando… ${Math.round(f * 100)}%` }));
          if (!novo && !fundoNovo) {
            mudar(i, { texto: "este aparelho não consegue refazer o vídeo (tente no Chrome do computador)", tipo: "erro" });
            continue;
          }
        }
        if (!novo && !fundoNovo) {
          mudar(i, { texto: "✅ já estava leve", tipo: "ok" });
          continue;
        }
        mudar(i, { texto: "enviando…" });
        await salvarCena(c, { ...(novo ? { video: novo } : {}), ...(fundoNovo ? { fundo: fundoNovo } : {}) });
        trocou = true;
        const feito = [novo ? `vídeo otimizado (${d.motivos.join("; ")})` : "", fundoNovo ? "trilha de fundo comprimida" : ""].filter(Boolean).join(" · ");
        mudar(i, { texto: `✅ ${feito}`, tipo: "feito" });
      } catch (e) {
        mudar(i, { texto: `não deu: ${mensagemDeErro(e)}`, tipo: "erro" });
      }
    }
    setRodando(false);
    if (trocou) aoTerminar();
  };

  return (
    <section className="cartao pilha" style={{ gap: 8 }}>
      <div className="linha entre" style={{ flexWrap: "wrap", gap: 8 }}>
        <div>
          <b>⚡ Vídeos leves para o celular</b>
          <div className="suave pequeno">Confere as cenas e refaz os vídeos que travam ao pular para cada fala. As falas não mudam.</div>
        </div>
        <button className="botao botao-primario" disabled={rodando || !podeOtimizar()} onClick={() => void rodar()}>
          {rodando ? "Otimizando…" : "⚡ Otimizar vídeos"}
        </button>
      </div>
      {!podeOtimizar() && <p className="suave pequeno" style={{ margin: 0 }}>Este aparelho não consegue refazer vídeos. Abra a área do administrador no Chrome do computador.</p>}
      {estados.length > 0 && (
        <ul className="lista-otimizar" aria-label="Otimização dos vídeos">
          {estados.map((e, i) => (
            <li key={i} className={e.tipo}>
              <b>{e.titulo}</b> <span className="suave">· {e.texto}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
