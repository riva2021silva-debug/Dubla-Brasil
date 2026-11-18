import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";
import { useAdmin } from "../admin";
import PedirApelido from "../componentes/PedirApelido";
import FotoPerfil from "../componentes/FotoPerfil";
import {
  apagarComentario,
  apagarPublicacao,
  comentar,
  denunciar,
  idAtual,
  listarComentarios,
  listarFeed,
  meuApelido,
  minhasReacoes,
  obterPublicacao,
  ocultarPublicacao,
  reagir,
  tempoAtras,
  type Comentario,
  type Publicacao,
} from "../galeria";

const POR_PAGINA = 6;

export default function Galeria() {
  const [params] = useSearchParams();
  const destaque = params.get("p");
  const [itens, setItens] = useState<Publicacao[]>([]);
  const [reacoes, setReacoes] = useState<Record<string, 1 | -1>>({});
  const [carregando, setCarregando] = useState(true);
  const [acabou, setAcabou] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [comentariosDe, setComentariosDe] = useState<Publicacao | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [eu, setEu] = useState<string | null>(null);
  const admin = useAdmin();
  const carregandoMais = useRef(false);

  const avisar = (t: string) => {
    setAviso(t);
    setTimeout(() => setAviso((a) => (a === t ? null : a)), 2500);
  };

  const juntar = useCallback(async (novos: Publicacao[]) => {
    setItens((atual) => {
      const vistos = new Set(atual.map((p) => p.id));
      const saida = [...atual];
      for (const p of novos) {
        if (vistos.has(p.id)) continue; // o dub em destaque também vem na lista: mostra uma vez só
        vistos.add(p.id);
        saida.push(p);
      }
      return saida;
    });
    const r = await minhasReacoes(novos.map((p) => p.id));
    setReacoes((atual) => ({ ...atual, ...r }));
  }, []);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        setEu(await idAtual());
        const primeiro = destaque ? await obterPublicacao(destaque) : null;
        const pagina = await listarFeed({ limite: POR_PAGINA });
        if (!vivo) return;
        setItens([]);
        await juntar([...(primeiro ? [primeiro] : []), ...pagina]);
        setAcabou(pagina.length < POR_PAGINA);
      } catch (e) {
        if (vivo) setErro(e instanceof Error ? e.message : String(e));
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [destaque, juntar]);

  const carregarMais = useCallback(async () => {
    if (carregandoMais.current || acabou || !itens.length) return;
    carregandoMais.current = true;
    try {
      const ultimo = itens[itens.length - 1];
      const pagina = await listarFeed({ antesDe: ultimo.criadaEm, limite: POR_PAGINA });
      await juntar(pagina);
      if (pagina.length < POR_PAGINA) setAcabou(true);
    } catch {
      /* tenta de novo na próxima rolagem */
    } finally {
      carregandoMais.current = false;
    }
  }, [acabou, itens, juntar]);

  const mudar = (id: string, parcial: Partial<Publicacao>) => setItens((l) => l.map((p) => (p.id === id ? { ...p, ...parcial } : p)));

  // Comentário escrito direto na barra do vídeo (sem abrir a gaveta). Sem apelido: pede e depois envia.
  const [comentarioPendente, setComentarioPendente] = useState<{ p: Publicacao; texto: string; feito: (ok: boolean) => void } | null>(null);
  const enviarComentario = async (p: Publicacao, texto: string) => {
    await comentar(p.id, texto);
    setEu(await idAtual());
    setItens((l) => l.map((x) => (x.id === p.id ? { ...x, comentarios: x.comentarios + 1 } : x)));
    avisar("💬 Comentário enviado!");
  };
  const comentarDireto = async (p: Publicacao, texto: string): Promise<boolean> => {
    try {
      if (!(await meuApelido())) return await new Promise<boolean>((feito) => setComentarioPendente({ p, texto, feito }));
      await enviarComentario(p, texto);
      return true;
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e));
      return false;
    }
  };

  const reagirEm = async (p: Publicacao, valor: 1 | -1) => {
    const atual = reacoes[p.id] ?? 0;
    const novo = atual === valor ? 0 : valor;
    // Atualiza na tela na hora; o servidor confirma os números depois.
    setReacoes((r) => {
      const c = { ...r };
      if (novo) c[p.id] = novo;
      else delete c[p.id];
      return c;
    });
    mudar(p.id, {
      curtidas: p.curtidas + (novo === 1 ? 1 : 0) - (atual === 1 ? 1 : 0),
      descurtidas: p.descurtidas + (novo === -1 ? 1 : 0) - (atual === -1 ? 1 : 0),
    });
    try {
      mudar(p.id, await reagir(p.id, novo));
      setEu(await idAtual());
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e));
    }
  };

  const compartilhar = async (p: Publicacao) => {
    const texto = `Olha meu dub de "${p.cenaTitulo}" no Dubla Brasil AI 🎙️`;
    try {
      if (Capacitor.isNativePlatform()) await Share.share({ title: p.cenaTitulo, text: texto, url: p.video });
      else if (navigator.share) await navigator.share({ title: p.cenaTitulo, text: texto, url: p.video });
      else {
        await navigator.clipboard.writeText(p.video);
        avisar("Link copiado!");
      }
    } catch {
      /* a pessoa cancelou */
    }
  };

  const denunciarDub = async (p: Publicacao) => {
    try {
      const r = await denunciar(p.id);
      if (r === "ok") mudar(p.id, { denuncias: p.denuncias + 1 });
      avisar(r === "ok" ? "Obrigado! O administrador vai revisar este dub." : "Você já denunciou este dub.");
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e));
    }
  };

  if (carregando) return <p className="suave">Carregando a galeria…</p>;
  if (erro) return <p className="alerta">{erro}</p>;

  return (
    <div className="galeria">
      {itens.length === 0 ? (
        <div className="cartao vazio">
          <p style={{ fontSize: "2.5rem", margin: 0 }}>🎬</p>
          <h2>Nenhum dub publicado ainda</h2>
          <p>Grave um dub e toque em “Publicar na galeria” para ser o primeiro!</p>
          <Link className="botao botao-primario" to="/cenas">
            Escolher uma cena
          </Link>
        </div>
      ) : (
        <div className="feed">
          {itens.map((p, i) => (
            <ItemFeed
              key={p.id}
              p={p}
              minha={reacoes[p.id] ?? 0}
              souAutor={!!eu && eu === p.autorId}
              admin={admin.aberto}
              ehUltimo={i === itens.length - 1}
              aoFicarVisivelUltimo={carregarMais}
              aoReagir={(v) => void reagirEm(p, v)}
              aoComentar={() => setComentariosDe(p)}
              aoComentarDireto={(texto) => comentarDireto(p, texto)}
              aoCompartilhar={() => void compartilhar(p)}
              aoDenunciar={() => void denunciarDub(p)}
              aoOcultar={async () => {
                try {
                  await ocultarPublicacao(p.id, !p.oculta);
                  mudar(p.id, { oculta: !p.oculta });
                  avisar(p.oculta ? "Dub visível de novo." : "Dub ocultado da galeria.");
                } catch (e) {
                  avisar(e instanceof Error ? e.message : String(e));
                }
              }}
              aoApagar={async () => {
                try {
                  await apagarPublicacao(p);
                  setItens((l) => l.filter((x) => x.id !== p.id));
                  avisar("Dub apagado.");
                } catch (e) {
                  avisar(e instanceof Error ? e.message : String(e));
                }
              }}
            />
          ))}
          {!acabou && <div className="feed-fim suave">Carregando mais…</div>}
        </div>
      )}
      {comentariosDe && (
        <GavetaComentarios
          p={comentariosDe}
          eu={eu}
          admin={admin.aberto}
          aoFechar={() => setComentariosDe(null)}
          aoMudarTotal={(n) => mudar(comentariosDe.id, { comentarios: n })}
          aoEntrar={(id) => setEu(id)}
        />
      )}
      {comentarioPendente && (
        <PedirApelido
          aoFechar={() => {
            comentarioPendente.feito(false);
            setComentarioPendente(null);
          }}
          aoConfirmar={() => {
            const { p, texto, feito } = comentarioPendente;
            setComentarioPendente(null);
            enviarComentario(p, texto).then(
              () => feito(true),
              (e) => {
                avisar(e instanceof Error ? e.message : String(e));
                feito(false);
              },
            );
          }}
        />
      )}
      {aviso && (
        <div className="aviso-flutuante" role="status">
          {aviso}
        </div>
      )}
    </div>
  );
}

function ItemFeed(props: {
  p: Publicacao;
  minha: 1 | -1 | 0;
  souAutor: boolean;
  admin: boolean;
  ehUltimo: boolean;
  aoFicarVisivelUltimo: () => void;
  aoReagir: (v: 1 | -1) => void;
  aoComentar: () => void;
  /** Comenta direto pela barra do vídeo; devolve true se enviou. */
  aoComentarDireto: (texto: string) => Promise<boolean>;
  aoCompartilhar: () => void;
  aoDenunciar: () => void;
  aoOcultar: () => void;
  aoApagar: () => void;
}) {
  const { p } = props;
  const caixa = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [mudo, setMudo] = useState(false);
  const [pausado, setPausado] = useState(true);
  const [confirmarApagar, setConfirmarApagar] = useState(false);
  const { aoFicarVisivelUltimo, ehUltimo } = props;

  // Toca quando o dub ocupa a tela; pausa quando sai.
  useEffect(() => {
    const el = caixa.current;
    const v = video.current;
    if (!el || !v) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && e.intersectionRatio >= 0.6) {
          v.play().catch(() => {
            // Navegador bloqueou som automático: toca mudo e mostra o aviso para ativar.
            v.muted = true;
            setMudo(true);
            void v.play().catch(() => {});
          });
          if (ehUltimo) aoFicarVisivelUltimo();
        } else {
          v.pause();
        }
      },
      { threshold: [0, 0.6, 1] },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [ehUltimo, aoFicarVisivelUltimo]);

  // Toque duplo curte (com coração animado); toque simples toca/pausa.
  const [coracoes, setCoracoes] = useState<{ id: number; x: number; y: number }[]>([]);
  const [progresso, setProgresso] = useState(0);
  const [deitado, setDeitado] = useState(true);
  const ultimoToque = useRef(0);
  const toqueSimples = useRef<number | undefined>(undefined);
  const aoTocarNoVideo = (e: React.MouseEvent<HTMLVideoElement>) => {
    const agora = Date.now();
    if (agora - ultimoToque.current < 300) {
      window.clearTimeout(toqueSimples.current);
      ultimoToque.current = 0;
      const r = e.currentTarget.getBoundingClientRect();
      const id = agora;
      setCoracoes((c) => [...c, { id, x: e.clientX - r.left, y: e.clientY - r.top }]);
      setTimeout(() => setCoracoes((c) => c.filter((x) => x.id !== id)), 900);
      if (props.minha !== 1) props.aoReagir(1);
      return;
    }
    ultimoToque.current = agora;
    toqueSimples.current = window.setTimeout(tocarOuPausar, 260);
  };

  const tocarOuPausar = () => {
    const v = video.current;
    if (!v) return;
    if (v.muted) {
      v.muted = false;
      setMudo(false);
      if (v.paused) void v.play();
      return;
    }
    if (v.paused) void v.play();
    else v.pause();
  };

  return (
    <article className={`post ${p.oculta ? "post-oculto" : ""}`} ref={caixa} aria-label={`Dub de ${p.apelido}: ${p.cenaTitulo}`}>
      <video
        ref={video}
        className="post-video"
        src={p.video}
        poster={p.capa ?? undefined}
        crossOrigin="anonymous"
        playsInline
        loop
        preload="metadata"
        onClick={aoTocarNoVideo}
        onTimeUpdate={(e) => setProgresso(e.currentTarget.currentTime / Math.max(0.1, e.currentTarget.duration || 1))}
        onLoadedMetadata={(e) => setDeitado(e.currentTarget.videoWidth >= e.currentTarget.videoHeight)}
        style={{ objectFit: deitado ? "contain" : "cover" }}
        onPlay={() => setPausado(false)}
        onPause={() => setPausado(true)}
      />
      {mudo && (
        <button className="pilula-som" onClick={tocarOuPausar}>
          🔇 Toque para ouvir
        </button>
      )}
      {!mudo && pausado && (
        <button className="post-play" onClick={tocarOuPausar} aria-label="Tocar">
          ▶
        </button>
      )}

      {coracoes.map((c) => (
        <span key={c.id} className="coracao-voador" style={{ left: c.x, top: c.y }} aria-hidden>
          ❤️
        </span>
      ))}
      <div className="post-progresso" aria-hidden>
        <div style={{ width: `${progresso * 100}%` }} />
      </div>
      <div className="post-acoes">
        {props.souAutor ? (
          <Link to="/conta" className="post-autor-link" title="Meu perfil" aria-label="Meu perfil">
            <FotoPerfil apelido={p.apelido} foto={p.autorFoto} tamanho={48} className="post-autor" />
          </Link>
        ) : (
          <FotoPerfil apelido={p.apelido} foto={p.autorFoto} tamanho={48} className="post-autor" />
        )}
        <button className={`acao ${props.minha === 1 ? "ativa" : ""}`} onClick={() => props.aoReagir(1)} aria-label={`Curtir (${p.curtidas})`} aria-pressed={props.minha === 1}>
          <span>👍</span>
          {p.curtidas}
        </button>
        <button className={`acao ${props.minha === -1 ? "ativa" : ""}`} onClick={() => props.aoReagir(-1)} aria-label={`Não curtir (${p.descurtidas})`} aria-pressed={props.minha === -1}>
          <span>👎</span>
          {p.descurtidas}
        </button>
        <button className="acao" onClick={props.aoComentar} aria-label={`Comentários (${p.comentarios})`}>
          <span>💬</span>
          {p.comentarios}
        </button>
        <button className="acao" onClick={props.aoCompartilhar} aria-label="Compartilhar">
          <span>↗</span>
          Enviar
        </button>
        {!props.souAutor && (
          <button className="acao" onClick={props.aoDenunciar} aria-label="Denunciar">
            <span>⚑</span>
            Denunciar
          </button>
        )}
        {props.admin && (
          <button className="acao" onClick={props.aoOcultar} aria-label={p.oculta ? "Mostrar na galeria" : "Ocultar da galeria"}>
            <span>{p.oculta ? "👁" : "🙈"}</span>
            {p.oculta ? "Mostrar" : "Ocultar"}
          </button>
        )}
        {(props.admin || props.souAutor) &&
          (confirmarApagar ? (
            <button className="acao perigo" onClick={props.aoApagar}>
              <span>🗑</span>
              Confirmar
            </button>
          ) : (
            <button className="acao" onClick={() => setConfirmarApagar(true)} aria-label="Apagar dub">
              <span>🗑</span>
              Apagar
            </button>
          ))}
      </div>

      <div className="post-info">
        <div>
          <strong>@{p.apelido}</strong> <span className="suave">· {tempoAtras(p.criadaEm)}</span>
          {p.oculta && <span className="etiqueta" style={{ marginLeft: 6 }}>Oculto</span>}
        </div>
        {p.duetoApelido && (
          <div>
            {p.duetoDe ? (
              <Link to={`/galeria?p=${p.duetoDe}`} className="selo-dueto" aria-label={`Dueto com @${p.duetoApelido}, ver o original`}>
                🎭 Dueto com @{p.duetoApelido}
              </Link>
            ) : (
              <span className="selo-dueto">🎭 Dueto com @{p.duetoApelido}</span>
            )}
          </div>
        )}
        <div className="post-cena">{p.cenaTitulo}</div>
        {p.papeis.length > 0 && <div className="suave pequeno">Dublando: {p.papeis.join(", ")}</div>}
        {p.cenaId && (
          <div className="linha" style={{ marginTop: 6, gap: 6, flexWrap: "wrap" }}>
            {!props.souAutor && (
              <Link className="botao botao-pequeno botao-primario" to={`/cena/${p.cenaId}?dueto=${p.id}`} aria-label={`Dublar junto com @${p.apelido}`}>
                🎭 Dublar junto
              </Link>
            )}
            <Link className={`botao botao-pequeno ${props.souAutor ? "botao-primario" : ""}`} to={`/cena/${p.cenaId}`}>
              🎙️ Dublar esta cena
            </Link>
          </div>
        )}
        <BarraComentario aoEnviar={props.aoComentarDireto} />
      </div>
    </article>
  );
}

function GavetaComentarios(props: { p: Publicacao; eu: string | null; admin: boolean; aoFechar: () => void; aoMudarTotal: (n: number) => void; aoEntrar: (id: string | null) => void }) {
  const [lista, setLista] = useState<Comentario[] | null>(null);
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [pedirApelido, setPedirApelido] = useState(false);
  const { p, aoMudarTotal } = props;

  const recarregar = useCallback(async () => {
    const l = await listarComentarios(p.id);
    setLista(l);
    aoMudarTotal(l.length);
  }, [p.id, aoMudarTotal]);

  useEffect(() => {
    recarregar().catch((e) => setErro(e instanceof Error ? e.message : String(e)));
  }, [recarregar]);

  const enviar = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!texto.trim()) return;
    setErro(null);
    setEnviando(true);
    try {
      if (!(await meuApelido())) {
        setPedirApelido(true);
        return;
      }
      await comentar(p.id, texto);
      setTexto("");
      props.aoEntrar(await idAtual());
      await recarregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="fundo-modal gaveta-fundo" role="dialog" aria-modal="true" aria-label="Comentários" onClick={(e) => e.target === e.currentTarget && props.aoFechar()}>
      <div className="gaveta">
        <div className="linha entre">
          <h3 style={{ margin: 0 }}>{lista ? `${lista.length} ${lista.length === 1 ? "comentário" : "comentários"}` : "Comentários"}</h3>
          <button className="botao botao-pequeno botao-icone" onClick={props.aoFechar} aria-label="Fechar">
            ✕
          </button>
        </div>
        {/* Campo de escrever no topo da gaveta: longe do rodapé (onde o teclado e selos de fora ficam). */}
        <form className="linha" style={{ flexWrap: "nowrap" }} onSubmit={enviar}>
          <input id="novo-comentario" className="entrada" placeholder="Escreva um comentário…" maxLength={300} value={texto} onChange={(e) => setTexto(e.target.value)} />
          <button className="botao botao-primario" type="submit" disabled={enviando || !texto.trim()}>
            Enviar
          </button>
        </form>
        {erro && <p className="alerta pequeno" style={{ margin: 0 }}>{erro}</p>}
        <div className="lista-comentarios">
          {lista === null ? (
            <p className="suave">Carregando…</p>
          ) : lista.length === 0 ? (
            <p className="suave">Ninguém comentou ainda. Seja o primeiro!</p>
          ) : (
            lista.map((c) => (
              <div key={c.id} className="comentario">
                <div className="linha entre">
                  <span className="linha" style={{ gap: 8, flexWrap: "nowrap" }}>
                    <FotoPerfil apelido={c.apelido} foto={c.foto} tamanho={28} />
                    <span>
                      <strong>@{c.apelido}</strong> <span className="suave pequeno">· {tempoAtras(c.criadoEm)}</span>
                    </span>
                  </span>
                  {(props.admin || props.eu === c.autorId) && (
                    <button
                      className="botao-texto pequeno"
                      onClick={async () => {
                        try {
                          await apagarComentario(c.id);
                          await recarregar();
                        } catch (err) {
                          setErro(err instanceof Error ? err.message : String(err));
                        }
                      }}
                    >
                      Apagar
                    </button>
                  )}
                </div>
                <p style={{ margin: "2px 0 0", overflowWrap: "anywhere" }}>{c.texto}</p>
              </div>
            ))
          )}
        </div>
      </div>
      {pedirApelido && (
        <PedirApelido
          aoFechar={() => setPedirApelido(false)}
          aoConfirmar={() => {
            setPedirApelido(false);
            void enviar();
          }}
        />
      )}
    </div>
  );
}

/** Barra "Faça um comentário…" do vídeo, com o botão de enviar ao lado (comenta sem abrir a gaveta). */
function BarraComentario({ aoEnviar }: { aoEnviar: (texto: string) => Promise<boolean> }) {
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!texto.trim() || enviando) return;
    setEnviando(true);
    try {
      if (await aoEnviar(texto)) {
        setTexto("");
        (document.activeElement as HTMLElement | null)?.blur();
      }
    } finally {
      setEnviando(false);
    }
  };
  return (
    <form className="post-barra-comentario" onSubmit={(e) => void enviar(e)} onClick={(e) => e.stopPropagation()}>
      <input
        className="post-campo-comentario"
        placeholder="Faça um comentário…"
        maxLength={300}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        aria-label="Faça um comentário"
        enterKeyHint="send"
      />
      <button type="submit" className="post-enviar-comentario" disabled={!texto.trim() || enviando} aria-label="Enviar comentário">
        {enviando ? "…" : "➤"}
      </button>
    </form>
  );
}
