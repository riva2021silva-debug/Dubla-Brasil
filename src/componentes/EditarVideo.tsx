import { useEffect, useRef, useState } from "react";
import {
  areaDoRecorte,
  processarVideo,
  type Edicao,
  type Formato,
} from "../edicaoVideo";
import { formatarTempo } from "../util";

const FORMATOS: { id: Formato; nome: string; dica: string }[] = [
  { id: "original", nome: "Original", dica: "sem recortar" },
  { id: "9:16", nome: "9:16", dica: "em pé (TikTok/Reels)" },
  { id: "1:1", nome: "1:1", dica: "quadrado" },
  { id: "16:9", nome: "16:9", dica: "deitado" },
];

/** Janela para cortar o vídeo e mudar o formato antes de salvar a cena. */
export default function EditarVideo(props: {
  url: string;
  duracaoMs: number;
  avisoFalas: boolean;
  aoAplicar: (arquivo: File, ed: Edicao) => Promise<void> | void;
  aoFechar: () => void;
}) {
  const [v, setV] = useState<HTMLVideoElement | null>(null);
  const [ed, setEd] = useState<Edicao>({
    inicioMs: 0,
    fimMs: props.duracaoMs,
    formato: "original",
    posicao: 0.5,
  });
  const [tam, setTam] = useState<{ l: number; a: number } | null>(null);
  const [progresso, setProgresso] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const controle = useRef<{ cancelar?: () => void }>({});

  useEffect(() => () => controle.current.cancelar?.(), []);

  // Toca só dentro do trecho escolhido.
  useEffect(() => {
    if (!v) return;
    const f = () => {
      if (v.currentTime * 1000 >= ed.fimMs) {
        v.pause();
        v.currentTime = ed.inicioMs / 1000;
      }
    };
    v.addEventListener("timeupdate", f);
    return () => v.removeEventListener("timeupdate", f);
  }, [v, ed.inicioMs, ed.fimMs]);

  const mudou =
    ed.formato !== "original" ||
    ed.inicioMs > 0 ||
    ed.fimMs < props.duracaoMs - 50;
  const durMs = ed.fimMs - ed.inicioMs;
  const area = tam ? areaDoRecorte(tam.l, tam.a, ed.formato, ed.posicao) : null;
  const precisaPosicao =
    !!tam &&
    !!area &&
    ed.formato !== "original" &&
    (area.l < tam.l || area.a < tam.a);

  const marcar = (qual: "inicioMs" | "fimMs") => {
    if (!v) return;
    const ms = Math.round(v.currentTime * 1000);
    setEd((e) =>
      qual === "inicioMs"
        ? { ...e, inicioMs: Math.min(ms, e.fimMs - 1000) }
        : { ...e, fimMs: Math.max(ms, e.inicioMs + 1000) }
    );
  };

  const aplicar = async () => {
    setErro(null);
    v?.pause();
    setProgresso(0);
    try {
      const arquivo = await processarVideo(
        props.url,
        ed,
        setProgresso,
        controle.current
      );
      if (!arquivo) return setProgresso(null);
      if (arquivo.size > 50 * 1024 * 1024)
        throw new Error(
          "O vídeo editado passou de 50 MB. Corte um trecho menor."
        );
      await props.aoAplicar(arquivo, ed);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      setProgresso(null);
    }
  };

  return (
    <div
      className="fundo-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-editar-video"
    >
      <div className="cartao pilha modal editar-video">
        <div className="linha entre">
          <h2 id="titulo-editar-video" style={{ margin: 0 }}>
            ✂️ Editar vídeo
          </h2>
          {progresso === null && (
            <button className="botao botao-pequeno" onClick={props.aoFechar}>
              Fechar
            </button>
          )}
        </div>

        <div className="previa-recorte">
          <div className="quadro-recorte">
            <video
              ref={setV}
              src={props.url}
              crossOrigin="anonymous"
              playsInline
              controls={progresso === null}
              preload="auto"
              onLoadedMetadata={(e) =>
                setTam({
                  l: e.currentTarget.videoWidth,
                  a: e.currentTarget.videoHeight,
                })
              }
            />
            {tam && area && ed.formato !== "original" && (
              <div
                className="moldura-recorte"
                aria-hidden
                style={{
                  left: `${(area.x / tam.l) * 100}%`,
                  top: `${(area.y / tam.a) * 100}%`,
                  width: `${(area.l / tam.l) * 100}%`,
                  height: `${(area.a / tam.a) * 100}%`,
                }}
              />
            )}
          </div>
        </div>

        {progresso !== null ? (
          <div className="pilha">
            <div
              className="progresso-edicao"
              role="progressbar"
              aria-valuenow={Math.round(progresso * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <span style={{ width: `${Math.round(progresso * 100)}%` }} />
            </div>
            <p className="suave pequeno" style={{ margin: 0 }}>
              Gerando o vídeo editado… {Math.round(progresso * 100)}%. Leva o
              mesmo tempo do trecho ({formatarTempo(durMs)}). Não saia desta
              tela nem bloqueie o celular.
            </p>
            <button
              className="botao botao-perigo"
              style={{ alignSelf: "flex-start" }}
              onClick={() => controle.current.cancelar?.()}
            >
              Cancelar
            </button>
          </div>
        ) : (
          <>
            <section className="pilha" style={{ gap: 8 }}>
              <b>Cortar</b>
              <label className="campo">
                Começa em {formatarTempo(ed.inicioMs)}
                <input
                  id="corte-inicio"
                  type="range"
                  min={0}
                  max={props.duracaoMs}
                  step={100}
                  value={ed.inicioMs}
                  onChange={(e) => {
                    const ms = Math.min(
                      Number(e.target.value),
                      ed.fimMs - 1000
                    );
                    setEd({ ...ed, inicioMs: ms });
                    if (v) v.currentTime = ms / 1000;
                  }}
                />
              </label>
              <label className="campo">
                Termina em {formatarTempo(ed.fimMs)}
                <input
                  id="corte-fim"
                  type="range"
                  min={0}
                  max={props.duracaoMs}
                  step={100}
                  value={ed.fimMs}
                  onChange={(e) => {
                    const ms = Math.max(
                      Number(e.target.value),
                      ed.inicioMs + 1000
                    );
                    setEd({ ...ed, fimMs: ms });
                    if (v) v.currentTime = ms / 1000;
                  }}
                />
              </label>
              <div className="linha">
                <button
                  className="botao botao-pequeno"
                  onClick={() => marcar("inicioMs")}
                >
                  ⏮ Começar aqui
                </button>
                <button
                  className="botao botao-pequeno"
                  onClick={() => marcar("fimMs")}
                >
                  Terminar aqui ⏭
                </button>
                <span className="suave pequeno">
                  Trecho: {formatarTempo(durMs)}
                </span>
              </div>
            </section>

            <section className="pilha" style={{ gap: 8 }}>
              <b>Formato</b>
              <div
                className="escolhas-formato"
                role="radiogroup"
                aria-label="Formato do vídeo"
              >
                {FORMATOS.map((f) => (
                  <button
                    key={f.id}
                    role="radio"
                    aria-checked={ed.formato === f.id}
                    className={`escolha-formato ${
                      ed.formato === f.id ? "ativa" : ""
                    }`}
                    onClick={() =>
                      setEd({ ...ed, formato: f.id, posicao: 0.5 })
                    }
                  >
                    <span
                      className={`icone-formato f-${f.id.replace(":", "x")}`}
                      aria-hidden
                    />
                    <b>{f.nome}</b>
                    <small>{f.dica}</small>
                  </button>
                ))}
              </div>
              {precisaPosicao && (
                <label className="campo">
                  Posição do recorte (arraste para escolher a parte da imagem)
                  <input
                    id="posicao-recorte"
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(ed.posicao * 100)}
                    onChange={(e) =>
                      setEd({ ...ed, posicao: Number(e.target.value) / 100 })
                    }
                  />
                </label>
              )}
            </section>

            {props.avisoFalas &&
              (ed.inicioMs > 0 || ed.fimMs < props.duracaoMs - 50) && (
                <p className="info pequeno" style={{ margin: 0 }}>
                  As falas e a trilha de fundo serão ajustadas ao corte. Falas
                  fora do trecho saem.
                </p>
              )}
            {erro && <p className="alerta">{erro}</p>}
            <button
              className="botao botao-primario botao-grande"
              disabled={!mudou}
              onClick={() => void aplicar()}
            >
              ✅ Aplicar edição
            </button>
          </>
        )}
      </div>
    </div>
  );
}
