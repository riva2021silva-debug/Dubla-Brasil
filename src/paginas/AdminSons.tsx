import { useRef, useState } from "react";
import { urlDaMidia } from "../db";
import { excluirSom, listarSons, mensagemDeErro, publicarSom, salvarSom } from "../nuvem";
import { useCarregar } from "../ganchos";
import { contextoDeAudio, decodificar } from "../audio/mixer";
import { CATEGORIAS_SOM, type Som } from "../tipos";
import { formatarTempo, novoId } from "../util";

const LIMITE_MS = 20_000;

interface Rascunho {
  id: string | null;
  titulo: string;
  categoria: string;
  emoji: string;
  arquivo: File | null;
  publicada: boolean;
}

const vazio = (): Rascunho => ({ id: null, titulo: "", categoria: CATEGORIAS_SOM[0], emoji: "", arquivo: null, publicada: true });

export default function AdminSons() {
  const sons = useCarregar(() => listarSons(true), []);
  const [form, setForm] = useState<Rascunho | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const [tocando, setTocando] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  const salvar = async () => {
    if (!form) return;
    setErro(null);
    if (!form.titulo.trim()) return setErro("Dê um nome para o som.");
    const existente = form.id ? sons.dado?.find((s) => s.id === form.id) : undefined;
    if (!form.arquivo && !existente) return setErro("Escolha o arquivo de áudio (ou vídeo) do som.");
    setSalvando(true);
    try {
      const id = form.id ?? novoId();
      let duracaoMs = existente?.duracaoMs ?? 0;
      if (form.arquivo) {
        let buf: AudioBuffer;
        try {
          buf = await decodificar(contextoDeAudio(), form.arquivo);
        } catch {
          throw new Error("Não foi possível ler esse arquivo. Use MP3, M4A, WAV, OGG ou um vídeo MP4.");
        }
        duracaoMs = Math.round(buf.duration * 1000);
        if (duracaoMs > LIMITE_MS) throw new Error(`O som tem ${formatarTempo(duracaoMs, false)}. Use trechos de até 20 segundos.`);
      }
      const som: Som = {
        id,
        titulo: form.titulo.trim(),
        categoria: form.categoria,
        emoji: form.emoji.trim().slice(0, 4),
        midia: existente?.midia ?? { tipo: "url", url: "" },
        duracaoMs,
        publicada: form.publicada,
        criadoEm: existente?.criadoEm ?? Date.now(),
        caminho: existente?.caminho,
      };
      await salvarSom(som, form.arquivo ?? undefined);
      setForm(null);
      sons.recarregar();
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setSalvando(false);
    }
  };

  const ouvir = async (s: Som) => {
    audio.current?.pause();
    if (tocando === s.id) return setTocando(null);
    const url = await urlDaMidia(s.midia);
    const a = new Audio();
    a.crossOrigin = "anonymous";
    a.src = url;
    audio.current = a;
    a.onended = () => setTocando(null);
    setTocando(s.id);
    void a.play();
  };

  const lista = sons.dado ?? [];

  return (
    <div className="pilha">
      <div className="linha entre">
        <p className="suave" style={{ margin: 0 }}>
          {lista.length} {lista.length === 1 ? "som" : "sons"} · {lista.filter((s) => s.publicada).length} publicados
        </p>
        {!form && (
          <button className="botao botao-primario" onClick={() => setForm(vazio())}>
            + Adicionar som
          </button>
        )}
      </div>

      {form && (
        <div className="cartao pilha">
          <h3 style={{ margin: 0 }}>{form.id ? "Editar som" : "Novo som"}</h3>
          <div className="linha">
            <button className="botao" onClick={() => entrada.current?.click()}>
              {form.arquivo ? "Trocar arquivo" : form.id ? "Trocar arquivo (opcional)" : "Escolher arquivo"}
            </button>
            <span className="suave pequeno">{form.arquivo ? form.arquivo.name : "Áudio ou vídeo curto, até 20 segundos."}</span>
          </div>
          <input
            ref={entrada}
            type="file"
            accept="audio/*,video/*"
            className="oculto"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              e.target.value = "";
              if (f) setForm((x) => x && { ...x, arquivo: f, titulo: x.titulo || f.name.replace(/\.[^.]+$/, "") });
            }}
          />
          <div className="linha" style={{ alignItems: "flex-end" }}>
            <label className="campo" style={{ flex: "0 0 80px" }}>
              Emoji
              <input id="som-emoji" className="entrada" value={form.emoji} placeholder="🔊" onChange={(e) => setForm({ ...form, emoji: e.target.value })} />
            </label>
            <label className="campo" style={{ flex: "1 1 200px" }}>
              Nome
              <input id="som-titulo" className="entrada" value={form.titulo} placeholder="Ex.: Risada do vilão" onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
            </label>
            <label className="campo" style={{ flex: "0 1 180px" }}>
              Categoria
              <select id="som-categoria" className="entrada" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
                {CATEGORIAS_SOM.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="linha interruptor">
            <input id="som-publicado" type="checkbox" checked={form.publicada} onChange={(e) => setForm({ ...form, publicada: e.target.checked })} />
            <span>Publicado no app</span>
          </label>
          {erro && <p className="alerta" style={{ margin: 0 }}>{erro}</p>}
          <div className="linha">
            <button className="botao botao-primario" onClick={salvar} disabled={salvando}>
              {salvando ? "Salvando…" : "💾 Salvar som"}
            </button>
            <button className="botao" onClick={() => setForm(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {erro && !form && <p className="alerta">{erro}</p>}
      {sons.erro && <p className="alerta">{sons.erro}</p>}
      {lista.length === 0 && !form ? (
        <div className="cartao vazio">
          <p style={{ marginTop: 0 }}>Nenhum som cadastrado.</p>
          <p className="pequeno" style={{ margin: 0 }}>Os sons aparecem no Modo Imitação: bordões, risadas, efeitos, vozes de personagens…</p>
        </div>
      ) : (
        lista.length > 0 && (
          <div className="cartao pilha" style={{ padding: 8 }}>
            {lista.map((s) => (
              <div key={s.id} className="linha-som">
                <span className="emoji-som" aria-hidden>
                  {s.emoji || "🔊"}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div className="linha" style={{ gap: 8 }}>
                    <strong className="titulo-admin">{s.titulo}</strong>
                    <span className={`etiqueta ${s.publicada ? "etiqueta-ok" : ""}`}>{s.publicada ? "Publicado" : "Oculto"}</span>
                  </div>
                  <span className="suave pequeno">
                    {s.categoria} · {formatarTempo(s.duracaoMs)}
                  </span>
                </div>
                <div className="linha acoes-admin">
                  <button className="botao botao-pequeno" onClick={() => ouvir(s)} aria-label={`Ouvir ${s.titulo}`}>
                    {tocando === s.id ? "■" : "▶"}
                  </button>
                  <button
                    className={`botao botao-pequeno ${s.publicada ? "" : "botao-verde"}`}
                    onClick={async () => {
                      try {
                        await publicarSom(s.id, !s.publicada);
                        sons.recarregar();
                      } catch (e) {
                        setErro(mensagemDeErro(e));
                      }
                    }}
                  >
                    {s.publicada ? "Ocultar" : "Publicar"}
                  </button>
                  <button className="botao botao-pequeno" onClick={() => setForm({ id: s.id, titulo: s.titulo, categoria: s.categoria, emoji: s.emoji, arquivo: null, publicada: s.publicada })}>
                    ✏️ Editar
                  </button>
                  {confirmar === s.id ? (
                    <>
                      <button
                        className="botao botao-pequeno botao-perigo"
                        onClick={async () => {
                          try {
                            await excluirSom(s);
                            setConfirmar(null);
                            sons.recarregar();
                          } catch (e) {
                            setErro(mensagemDeErro(e));
                          }
                        }}
                      >
                        Confirmar exclusão
                      </button>
                      <button className="botao botao-pequeno" onClick={() => setConfirmar(null)}>
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <button className="botao botao-pequeno botao-perigo" onClick={() => setConfirmar(s.id)} aria-label={`Excluir ${s.titulo}`}>
                      🗑
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
