import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useConfig } from "../config";
import { listarMicrofones, Microfone } from "../audio/microfone";
import { contextoDeAudio } from "../audio/mixer";

const SEGMENTOS = 24;

/** Teste rápido do microfone antes do estúdio: medidor, escolha do aparelho e gravar/ouvir 3 segundos. */
export default function TesteMicrofone() {
  const [cfg, salvar] = useConfig();
  const mic = useRef<Microfone | null>(null);
  const [aberto, setAberto] = useState(false);
  const [nivel, setNivel] = useState(0);
  const [ouviuEm, setOuviuEm] = useState(0);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [fase, setFase] = useState<"parado" | "gravando" | "tocando">("parado");
  const [contagem, setContagem] = useState(3);
  const [erro, setErro] = useState<string | null>(null);

  const abrir = async (dispositivo = cfg.microfoneId) => {
    setErro(null);
    try {
      const ctx = contextoDeAudio();
      await ctx.resume();
      mic.current?.fechar();
      mic.current = await Microfone.abrir(ctx, { ...cfg, microfoneId: dispositivo });
      setAberto(true);
      setMics(await listarMicrofones());
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  };

  // Se a permissão já foi dada antes, liga o medidor sozinho.
  useEffect(() => {
    let vivo = true;
    navigator.permissions
      ?.query({ name: "microphone" as PermissionName })
      .then((p) => {
        if (vivo && p.state === "granted") void abrir();
      })
      .catch(() => {});
    return () => {
      vivo = false;
      mic.current?.fechar();
      mic.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!aberto) return;
    let raf = 0;
    const loop = () => {
      const n = mic.current?.nivel() ?? 0;
      setNivel(n);
      if (n > 0.04) setOuviuEm(performance.now());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [aberto]);

  const testar = async () => {
    if (!mic.current) await abrir();
    const m = mic.current;
    if (!m) return;
    const ctx = contextoDeAudio();
    setFase("gravando");
    setContagem(3);
    m.iniciar();
    for (let s = 2; s >= 0; s--) {
      await new Promise((r) => setTimeout(r, 1000));
      setContagem(s);
    }
    const g = m.parar();
    if (!g || !g.amostras.length) {
      setFase("parado");
      return setErro("Nada foi gravado. Escolha outro microfone.");
    }
    const buf = ctx.createBuffer(1, g.amostras.length, g.taxa);
    buf.copyToChannel(g.amostras as Float32Array<ArrayBuffer>, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.onended = () => setFase("parado");
    setFase("tocando");
    src.start();
  };

  const somRecente = ouviuEm > 0 && performance.now() - ouviuEm < 1500;
  const acesos = Math.min(SEGMENTOS, Math.round(nivel * SEGMENTOS * 1.6));

  return (
    <section className="cartao teste-mic">
      <div className="linha entre">
        <strong className="linha" style={{ gap: 8 }}>
          🎙️ Teste rápido do microfone
        </strong>
        {aberto && (
          <select
            id="microfone-teste"
            className="entrada"
            style={{ width: "auto", maxWidth: 200, padding: "6px 10px" }}
            value={cfg.microfoneId}
            aria-label="Microfone"
            onChange={(e) => {
              salvar({ microfoneId: e.target.value });
              void abrir(e.target.value);
            }}
          >
            <option value="">Padrão do aparelho</option>
            {mics
              .filter((m) => m.deviceId && m.deviceId !== "default")
              .map((m, i) => (
                <option key={m.deviceId} value={m.deviceId}>
                  {m.label || `Microfone ${i + 1}`}
                </option>
              ))}
          </select>
        )}
      </div>

      <div className="linha" style={{ flexWrap: "nowrap" }}>
        <div className="segmentos" aria-label="Nível do microfone">
          {Array.from({ length: SEGMENTOS }, (_, i) => (
            <i key={i} className={i < acesos ? (i >= SEGMENTOS - 3 ? "alto" : "aceso") : ""} />
          ))}
        </div>
        <span className="pequeno" style={{ whiteSpace: "nowrap", color: aberto && somRecente ? "var(--verde)" : "var(--texto-suave)", fontWeight: 700 }}>
          ● {!aberto ? "Desligado" : somRecente ? "Som detectado" : "Silêncio"}
        </span>
      </div>

      <div className="linha" style={{ gap: 8 }}>
        {!aberto ? (
          <button className="botao botao-primario" style={{ flex: 1 }} onClick={() => void abrir()}>
            Ligar o microfone
          </button>
        ) : (
          <button className="botao" style={{ flex: 1 }} disabled={fase !== "parado"} onClick={() => void testar()}>
            {fase === "gravando" ? `Gravando… ${contagem}` : fase === "tocando" ? "Ouvindo…" : "🎧 Gravar 3 s e ouvir"}
          </button>
        )}
        <Link className="botao" to="/configuracoes" style={{ flex: 1 }}>
          ⚙️ Ajustes
        </Link>
      </div>
      {erro && <p className="alerta pequeno" style={{ margin: 0 }}>{erro}</p>}
      <p className="suave pequeno" style={{ margin: 0 }}>
        {aberto ? "Fale algo e veja a barra se mexer." : "Ligue para ver se o microfone está funcionando."} 🎧 Use fones de ouvido para não gravar o som do vídeo.
      </p>
    </section>
  );
}
