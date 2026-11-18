import { useEffect, useRef, useState } from "react";
import { APELIDO_VALIDO, definirApelido, definirFotoPerfil, meuPerfil, removerFotoPerfil, type MeuPerfil as Perfil } from "../galeria";
import FotoPerfil from "./FotoPerfil";

/** Meu perfil: foto (da galeria do celular ou da câmera) e apelido que aparecem nos vídeos e comentários. */
export default function MeuPerfil() {
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [apelido, setApelido] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  const carregar = async () => {
    try {
      const p = await meuPerfil();
      setPerfil(p);
      setApelido(p.apelido ?? "");
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  };
  useEffect(() => {
    void carregar();
  }, []);

  const executar = async (rotulo: string, fn: () => Promise<unknown>, ok: string) => {
    setErro(null);
    setAviso(null);
    setOcupado(rotulo);
    try {
      await fn();
      await carregar();
      setAviso(ok);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(null);
    }
  };

  const nomeMudou = apelido.trim() !== (perfil?.apelido ?? "");
  const nomeValido = APELIDO_VALIDO.test(apelido.trim());

  return (
    <section className="cartao pilha perfil-cartao" aria-label="Meu perfil">
      <h2 style={{ margin: 0 }}>Meu perfil</h2>
      <button
        type="button"
        className="perfil-foto-botao"
        onClick={() => (perfil?.apelido ? entrada.current?.click() : setErro("Escolha seu apelido primeiro (embaixo) e depois a foto."))}
        disabled={!!ocupado}
        aria-label={perfil?.foto ? "Trocar a foto do perfil" : "Colocar foto no perfil"}
      >
        <FotoPerfil apelido={perfil?.apelido || apelido || "?"} foto={perfil?.foto ?? null} tamanho={112} />
        <span className="perfil-camera" aria-hidden>
          📷
        </span>
      </button>
      <input
        ref={entrada}
        id="foto-perfil"
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void executar("foto", () => definirFotoPerfil(f), "✅ Foto do perfil atualizada!");
        }}
      />
      <div className="linha" style={{ gap: 8, justifyContent: "center" }}>
        <button className="botao botao-pequeno" disabled={!!ocupado || !perfil?.apelido} onClick={() => entrada.current?.click()}>
          {ocupado === "foto" ? "Enviando…" : perfil?.foto ? "📷 Trocar foto" : "📷 Colocar foto"}
        </button>
        {perfil?.foto && (
          <button className="botao botao-pequeno" disabled={!!ocupado} onClick={() => void executar("tirar", removerFotoPerfil, "Foto removida.")}>
            Remover foto
          </button>
        )}
      </div>
      <form
        className="pilha"
        style={{ width: "100%", maxWidth: 360, gap: 8 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (nomeMudou && nomeValido) void executar("nome", () => definirApelido(apelido), "✅ Apelido salvo!");
        }}
      >
        <label className="campo" style={{ textAlign: "left" }}>
          Apelido (aparece nos vídeos e comentários)
          <div className="linha" style={{ gap: 8, flexWrap: "nowrap" }}>
            <span className="suave" aria-hidden>
              @
            </span>
            <input
              id="apelido-perfil"
              className="entrada"
              style={{ flex: 1, minWidth: 0 }}
              maxLength={20}
              value={apelido}
              placeholder="ex.: voz_de_ouro"
              autoComplete="nickname"
              onChange={(e) => setApelido(e.target.value.replace(/\s/g, ""))}
            />
            <button className="botao botao-primario" disabled={!!ocupado || !nomeMudou || !nomeValido}>
              {ocupado === "nome" ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </label>
        {apelido && !nomeValido && <span className="suave pequeno">Use de 3 a 20 letras, números, ponto ou _ (sem espaços).</span>}
      </form>
      {erro && <p className="alerta" style={{ margin: 0 }}>{erro}</p>}
      {aviso && <p className="info" style={{ margin: 0 }}>{aviso}</p>}
    </section>
  );
}
