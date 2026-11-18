import { Link } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { PADRAO, useConfig } from "../config";
import { listarMicrofones, Microfone } from "../audio/microfone";
import { contextoDeAudio } from "../audio/mixer";
import { VERSAO_APP } from "../atualizacao";
import { procurarAtualizacao } from "../componentes/AvisoAtualizacao";

export default function Configuracoes() {
  const [cfg, salvar] = useConfig();
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [testando, setTestando] = useState(false);
  const [nivel, setNivel] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const mic = useRef<Microfone | null>(null);

  useEffect(() => {
    void listarMicrofones().then(setMics);
    return () => mic.current?.fechar();
  }, []);

  useEffect(() => {
    if (!testando) return;
    let raf = 0;
    const loop = () => {
      setNivel(mic.current?.nivel() ?? 0);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [testando]);

  const testar = async () => {
    setErro(null);
    if (testando) {
      mic.current?.fechar();
      mic.current = null;
      setTestando(false);
      return;
    }
    try {
      const ctx = contextoDeAudio();
      await ctx.resume();
      mic.current = await Microfone.abrir(ctx, cfg);
      setTestando(true);
      setMics(await listarMicrofones()); // os nomes só aparecem depois da permissão
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="pilha" style={{ maxWidth: 720 }}>
      <h1>Configurações</h1>
      <Link to="/conta" className="cartao linha entre" style={{ textDecoration: "none", color: "inherit" }}>
        <span>
          <b>👤 Meu perfil e conta</b>
          <br />
          <span className="suave pequeno">Foto, apelido, plano Premium</span>
        </span>
        <span aria-hidden>›</span>
      </Link>
      <p className="suave" style={{ margin: 0 }}>
        Ficam salvas neste aparelho e valem para todas as cenas.
      </p>

      <section className="cartao pilha">
        <h2>Microfone</h2>
        <label className="campo">
          Dispositivo
          <select
            className="entrada"
            value={cfg.microfoneId}
            onChange={(e) => {
              salvar({ microfoneId: e.target.value });
              if (testando) {
                mic.current?.fechar();
                mic.current = null;
                setTestando(false);
              }
            }}
          >
            <option value="">Padrão do sistema</option>
            {mics
              .filter((m) => m.deviceId && m.deviceId !== "default")
              .map((m, i) => (
                <option key={m.deviceId} value={m.deviceId}>
                  {m.label || `Microfone ${i + 1}`}
                </option>
              ))}
          </select>
        </label>
        <div className="linha">
          <button className={`botao ${testando ? "" : "botao-primario"}`} onClick={testar}>
            {testando ? "Parar teste" : "🎙️ Testar microfone"}
          </button>
          {testando && (
            <div className="medidor" style={{ flex: 1, minWidth: 160 }}>
              <div style={{ width: `${Math.min(100, nivel * 140)}%` }} />
            </div>
          )}
        </div>
        {testando && <span className="suave pequeno">Fale algo: a barra deve se mexer. Se ficar parada, escolha outro dispositivo.</span>}
        {erro && <p className="alerta">{erro}</p>}
        <label className="linha">
          <input type="checkbox" checked={cfg.cancelamentoEco} onChange={(e) => salvar({ cancelamentoEco: e.target.checked })} />
          <span>
            Cancelamento de eco <span className="suave pequeno">(tira do microfone o som do vídeo que sai pelo alto-falante)</span>
          </span>
        </label>
        <label className="linha">
          <input type="checkbox" checked={cfg.reducaoRuido} onChange={(e) => salvar({ reducaoRuido: e.target.checked })} />
          <span>
            Redução de ruído <span className="suave pequeno">(ventilador, ar-condicionado, barulho de rua)</span>
          </span>
        </label>
        <label className="linha">
          <input type="checkbox" checked={cfg.limparVoz} onChange={(e) => salvar({ limparVoz: e.target.checked })} />
          <span>
            Limpar a voz depois de gravar <span className="suave pequeno">(corta graves de ruído, abafa o chiado nas pausas e equilibra o volume)</span>
          </span>
        </label>
        <label className="linha">
          <input type="checkbox" checked={cfg.alinharVoz} onChange={(e) => salvar({ alinharVoz: e.target.checked })} />
          <span>
            Alinhar a voz com a fala original <span className="suave pequeno">(corrige até 0,3 s de adiantado ou atrasado)</span>
          </span>
        </label>
      </section>

      <section className="cartao pilha">
        <h2>Gravação</h2>
        <label className="campo">
          Tempo antes da fala: {(cfg.preRollMs / 1000).toFixed(1)} s
          <input type="range" min={1000} max={5000} step={500} value={cfg.preRollMs} onChange={(e) => salvar({ preRollMs: +e.target.value })} />
          <span className="suave pequeno">Quanto do vídeo toca antes de cada fala, para você entrar no clima.</span>
        </label>
        <label className="campo">
          Ajuste de sincronia: {cfg.latenciaMs > 0 ? "+" : ""}
          {cfg.latenciaMs} ms
          <input type="range" min={-300} max={500} step={10} value={cfg.latenciaMs} onChange={(e) => salvar({ latenciaMs: +e.target.value })} />
          <span className="suave pequeno">
            Se a sua voz sai atrasada em relação à boca do personagem, aumente. Se sai adiantada, diminua. Vale para as
            próximas gravações.
          </span>
        </label>
      </section>

      <section className="cartao pilha">
        <h2>Mixagem</h2>
        <label className="campo">
          Volume da sua voz: {Math.round(cfg.volumeVoz * 100)}%
          <input type="range" min={0} max={2} step={0.05} value={cfg.volumeVoz} onChange={(e) => salvar({ volumeVoz: +e.target.value })} />
        </label>
        <label className="linha" style={{ alignItems: "flex-start" }}>
          <input type="checkbox" checked={cfg.somAmbiente} onChange={(e) => salvar({ somAmbiente: e.target.checked })} />
          <span>
            <b>🎵 Manter o som ambiente nas minhas falas</b>
            <br />
            <span className="suave pequeno">
              Tira só a voz original e deixa a música e os efeitos do vídeo tocando junto com a sua voz (quando a cena não tem
              trilha de fundo). Funciona com vídeos em estéreo, que são quase todos.
            </span>
          </span>
        </label>
        <label className="campo">
          Áudio original durante as suas falas (cenas sem trilha de fundo): {Math.round(cfg.volumeOriginalNaMinhaFala * 100)}%
          <input type="range" min={0} max={0.5} step={0.05} value={cfg.volumeOriginalNaMinhaFala} onChange={(e) => salvar({ volumeOriginalNaMinhaFala: +e.target.value })} />
          <span className="suave pequeno">Em 0%, o original some enquanto você fala. Um pouco de volume mantém a música, mas a voz original vaza.</span>
        </label>
        <label className="linha">
          <input type="checkbox" checked={cfg.mostrarLegendas} onChange={(e) => salvar({ mostrarLegendas: e.target.checked })} />
          Mostrar legendas no vídeo (e no vídeo baixado)
        </label>
      </section>

      <div>
        <button className="botao" onClick={() => salvar({ ...PADRAO, microfoneId: cfg.microfoneId })}>
          Restaurar padrões
        </button>
      </div>

      <section className="cartao linha entre">
        <span>
          <b>Dubla Brasil AI</b> <span className="suave">versão {VERSAO_APP}</span>
        </span>
        <button className="botao botao-pequeno" onClick={procurarAtualizacao}>
          🔄 Procurar atualização
        </button>
      </section>
    </div>
  );
}
