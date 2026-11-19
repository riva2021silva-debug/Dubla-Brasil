import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { entrar, sair, useAdmin } from "../admin";
import { Capa } from "../componentes/CartaoCena";
import { blobDaMidia, db } from "../db";
import { todasAsCenas, useCarregar } from "../ganchos";
import OtimizarCenas from "../componentes/OtimizarCenas";
import GerarFundos from "../componentes/GerarFundos";
import AvisoEspacoBanner from "../componentes/AvisoEspaco";
import { useAvisoEspaco } from "../espaco";
import { excluirCena, mensagemDeErro, publicarCena, salvarCena, salvarSom, trocarSenha } from "../nuvem";
import { exportarPacote, importarPacote } from "../pacote";
import { estaPublicada, type Cena } from "../tipos";
import { baixarArquivo, dataCurta, formatarTempo, nomeArquivo } from "../util";
import AdminSons from "./AdminSons";
import AdminGaleria from "./AdminGaleria";
import AdminAssinantes from "./AdminAssinantes";
import AdminMensagens from "./AdminMensagens";
import { apagarRascunho, lerRascunho, quandoFoi, type Rascunho } from "../rascunho";

/** Protege uma página: só abre para o administrador logado. */
export function SoAdmin({ children }: { children: React.ReactNode }) {
  const { aberto, carregando } = useAdmin();
  if (carregando) return <p className="suave">Verificando acesso…</p>;
  return aberto ? <>{children}</> : <Navigate to="/admin" replace />;
}

function TelaLogin() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErro(null);
    if (!email.includes("@") || !senha) return setErro("Preencha o e-mail e a senha.");
    setEntrando(true);
    try {
      await entrar(email, senha);
    } catch (err) {
      setErro(mensagemDeErro(err));
      setSenha("");
    } finally {
      setEntrando(false);
    }
  };

  return (
    <form className="cartao pilha" style={{ maxWidth: 420, margin: "40px auto" }} onSubmit={enviar}>
      <h1 style={{ fontSize: "1.8rem" }}>Área do administrador</h1>
      <p className="suave" style={{ margin: 0 }}>
        Entre com o e-mail e a senha do administrador (o usuário criado no Supabase).
      </p>
      <label className="campo">
        E-mail
        <input id="admin-email" className="entrada" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
      </label>
      <label className="campo">
        Senha
        <input id="admin-senha" className="entrada" type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} />
      </label>
      {erro && <p className="alerta" style={{ margin: 0 }}>{erro}</p>}
      <button className="botao botao-primario" type="submit" disabled={entrando}>
        {entrando ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}

function TrocarSenha() {
  const [aberto, setAberto] = useState(false);
  const [nova, setNova] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  if (!aberto)
    return (
      <button className="botao botao-pequeno" onClick={() => setAberto(true)}>
        Trocar senha
      </button>
    );
  return (
    <form
      className="linha"
      onSubmit={async (e) => {
        e.preventDefault();
        if (nova.length < 8) return setMsg({ ok: false, texto: "Use pelo menos 8 caracteres." });
        try {
          await trocarSenha(nova);
          setMsg({ ok: true, texto: "Senha trocada." });
          setNova("");
          setTimeout(() => setAberto(false), 1500);
        } catch (err) {
          setMsg({ ok: false, texto: mensagemDeErro(err) });
        }
      }}
    >
      <input id="nova-senha" className="entrada" style={{ width: 200 }} type="password" autoComplete="new-password" placeholder="Nova senha" value={nova} onChange={(e) => setNova(e.target.value)} />
      <button className="botao botao-pequeno" type="submit">
        Salvar
      </button>
      {msg && <span className="pequeno" style={{ color: msg.ok ? "var(--verde)" : "var(--perigo)" }}>{msg.texto}</span>}
    </form>
  );
}

function LinhaCena({ cena, aoMudar, aoErro }: { cena: Cena; aoMudar: () => void; aoErro: (m: string) => void }) {
  const [confirmar, setConfirmar] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const publicada = estaPublicada(cena);
  const executar = async (fn: () => Promise<unknown>) => {
    setOcupado(true);
    try {
      await fn();
      aoMudar();
    } catch (e) {
      aoErro(mensagemDeErro(e));
    } finally {
      setOcupado(false);
    }
  };
  return (
    <div className="linha-admin">
      <div className="miniatura">
        <Capa cena={cena} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="linha" style={{ gap: 8 }}>
          <strong className="titulo-admin">{cena.titulo}</strong>
          <span className={`etiqueta ${publicada ? "etiqueta-ok" : ""}`}>{publicada ? "Publicada" : "Oculta"}</span>
          {!cena.fundo && <span className="etiqueta" title="Sem trilha de fundo">Sem fundo</span>}
        </div>
        <div className="suave pequeno">
          {formatarTempo(cena.duracaoMs, false)} · {cena.falas.length} falas · {cena.personagens.map((p) => p.nome).join(", ") || "sem personagens"} · editada em{" "}
          {dataCurta(cena.atualizadaEm)}
        </div>
      </div>
      <div className="linha acoes-admin">
        <button className={`botao botao-pequeno ${publicada ? "" : "botao-verde"}`} disabled={ocupado} onClick={() => executar(() => publicarCena(cena.id, !publicada))}>
          {publicada ? "Ocultar" : "Publicar"}
        </button>
        <Link className="botao botao-pequeno" to={`/admin/cena/${cena.id}`}>
          ✏️ Editar
        </Link>
        <Link className="botao botao-pequeno" to={`/cena/${cena.id}`}>
          Testar
        </Link>
        <button
          className="botao botao-pequeno"
          disabled={ocupado}
          title="Baixar a cena como pacote .dubla"
          onClick={() => executar(async () => baixarArquivo(await exportarPacote(cena), `${nomeArquivo(cena.titulo)}.dubla`))}
        >
          📦
        </button>
        {confirmar ? (
          <>
            <button className="botao botao-pequeno botao-perigo" disabled={ocupado} onClick={() => executar(() => excluirCena(cena))}>
              {ocupado ? "Excluindo…" : "Confirmar exclusão"}
            </button>
            <button className="botao botao-pequeno" onClick={() => setConfirmar(false)}>
              Cancelar
            </button>
          </>
        ) : (
          <button className="botao botao-pequeno botao-perigo" onClick={() => setConfirmar(true)} aria-label={`Excluir ${cena.titulo}`}>
            🗑
          </button>
        )}
      </div>
    </div>
  );
}

/** Cenas e sons criados antes do servidor ficaram só no aparelho: oferece enviar tudo. */
function EnviarDoAparelho({ aoTerminar }: { aoTerminar: () => void }) {
  const locais = useCarregar(async () => ({ cenas: await db.listarCenas(), sons: await db.listarSons() }), []);
  const [estado, setEstado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const qtdCenas = locais.dado?.cenas.length ?? 0;
  const qtdSons = locais.dado?.sons.length ?? 0;
  if (!qtdCenas && !qtdSons) return null;

  const enviarTudo = async () => {
    setErro(null);
    try {
      let n = 0;
      for (const c of locais.dado!.cenas) {
        setEstado(`Enviando cena ${++n} de ${qtdCenas}: ${c.titulo}…`);
        const video = await blobDaMidia(c.video);
        const fundo = c.fundo ? await blobDaMidia(c.fundo) : undefined;
        const capa = c.capa ? await blobDaMidia(c.capa).catch(() => undefined) : undefined;
        await salvarCena({ ...c, caminhos: undefined }, { video, fundo, capa });
        for (const f of [c.video, c.fundo, c.capa]) if (f?.tipo === "blob") await db.excluirMidia(f.chave);
        await db.excluirCena(c.id); // os dubs continuam: a cena mantém o mesmo id no servidor
      }
      n = 0;
      for (const s of locais.dado!.sons) {
        setEstado(`Enviando som ${++n} de ${qtdSons}: ${s.titulo}…`);
        await salvarSom({ ...s, caminho: undefined }, await blobDaMidia(s.midia));
        if (s.midia.tipo === "blob") await db.excluirMidia(s.midia.chave);
        await db.excluirSom(s.id);
      }
      setEstado(null);
      locais.recarregar();
      aoTerminar();
    } catch (e) {
      setEstado(null);
      setErro(mensagemDeErro(e));
      locais.recarregar();
    }
  };

  return (
    <div className="info pilha">
      <strong>
        Este aparelho tem {qtdCenas} {qtdCenas === 1 ? "cena" : "cenas"} e {qtdSons} {qtdSons === 1 ? "som" : "sons"} salvos só aqui.
      </strong>
      <span className="pequeno">Envie para o servidor para que apareçam para todos os usuários do app.</span>
      {erro && <span className="alerta pequeno">{erro}</span>}
      <div>
        <button className="botao botao-primario" disabled={!!estado} onClick={enviarTudo}>
          {estado ?? "☁️ Enviar para o servidor"}
        </button>
      </div>
    </div>
  );
}

function Painel() {
  const { email, aberto } = useAdmin();
  const [params] = useSearchParams();
  const [aba, setAba] = useState<"cenas" | "sons" | "galeria" | "assinantes" | "mensagens">(params.get("aba") === "galeria" ? "galeria" : "cenas");
  const avisoEspaco = useAvisoEspaco(aberto);
  const [versao, setVersao] = useState(0);
  return (
    <div className="pilha">
      <div className="linha entre">
        <h1 style={{ margin: 0 }}>Administração</h1>
        <span className="suave pequeno">Conectado como {email}</span>
      </div>
      <AvisoEspacoBanner aviso={avisoEspaco} aoLiberar={() => setAba("galeria")} />
      <AvisoRascunho />
      <EnviarDoAparelho aoTerminar={() => setVersao((v) => v + 1)} />
      <div className="abas" role="tablist">
        <button role="tab" aria-selected={aba === "cenas"} className={aba === "cenas" ? "ativa" : ""} onClick={() => setAba("cenas")}>
          🎬 Cenas
        </button>
        <button role="tab" aria-selected={aba === "sons"} className={aba === "sons" ? "ativa" : ""} onClick={() => setAba("sons")}>
          🦜 Sons da Imitação
        </button>
        <button role="tab" aria-selected={aba === "galeria"} className={aba === "galeria" ? "ativa" : ""} onClick={() => setAba("galeria")}>
          🌎 Galeria
        </button>
        <button role="tab" aria-selected={aba === "assinantes"} className={aba === "assinantes" ? "ativa" : ""} onClick={() => setAba("assinantes")}>
          ⭐ Assinantes
        </button>
        <button role="tab" aria-selected={aba === "mensagens"} className={aba === "mensagens" ? "ativa" : ""} onClick={() => setAba("mensagens")}>
          💬 Mensagens
        </button>
      </div>
      {aba === "cenas" ? <PainelCenas key={versao} /> : aba === "sons" ? <AdminSons key={versao} /> : aba === "galeria" ? <AdminGaleria /> : aba === "assinantes" ? <AdminAssinantes /> : (
        <AdminMensagens aoMudar={() => window.dispatchEvent(new Event("dubla:mensagens-mudaram"))} />
      )}
      <div className="linha entre" style={{ marginTop: 8 }}>
        <TrocarSenha />
        <button className="botao botao-pequeno" onClick={() => void sair()}>
          🔒 Sair
        </button>
      </div>
    </div>
  );
}

function PainelCenas() {
  const cenas = useCarregar(() => todasAsCenas(true), []);
  // A lista fica guardada enquanto recarrega (o painel de otimizar não some no meio e mantém o resultado na tela).
  const ultimasCenas = useRef<Cena[]>([]);
  if (cenas.dado) ultimasCenas.current = cenas.dado;
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);
  const arquivo = useRef<HTMLInputElement>(null);
  const navegar = useNavigate();
  const lista = (cenas.dado ?? []).filter((c) => c.titulo.toLowerCase().includes(busca.trim().toLowerCase()));
  const publicadas = (cenas.dado ?? []).filter(estaPublicada).length;
  const total = cenas.dado?.length ?? 0;

  return (
    <div className="pilha">
      <div className="linha entre">
        <p className="suave" style={{ margin: 0 }}>
          {total} {total === 1 ? "cena" : "cenas"} · {publicadas} {publicadas === 1 ? "publicada" : "publicadas"} · {total - publicadas}{" "}
          {total - publicadas === 1 ? "oculta" : "ocultas"}
        </p>
        <div className="linha">
          <button className="botao" onClick={() => arquivo.current?.click()} disabled={importando}>
            {importando ? "Enviando…" : "📦 Importar pacote"}
          </button>
          <Link className="botao botao-primario" to="/admin/cena/nova">
            + Adicionar vídeo
          </Link>
        </div>
      </div>
      {ultimasCenas.current.length > 0 && <GerarFundos cenas={ultimasCenas.current} aoTerminar={cenas.recarregar} />}
      {ultimasCenas.current.length > 0 && <OtimizarCenas cenas={ultimasCenas.current} aoTerminar={cenas.recarregar} />}
      <input
        ref={arquivo}
        type="file"
        accept=".dubla,.zip"
        className="oculto"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setErro(null);
          setImportando(true);
          try {
            const c = await importarPacote(f);
            navegar(`/admin/cena/${c.id}`);
          } catch (err) {
            setErro(mensagemDeErro(err));
          } finally {
            setImportando(false);
          }
        }}
      />
      {erro && <p className="alerta">{erro}</p>}
      {cenas.erro && <p className="alerta">{cenas.erro}</p>}

      {total > 3 && (
        <input id="busca-admin" className="entrada" style={{ maxWidth: 360 }} type="search" placeholder="Buscar cena pelo título…" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar cena" />
      )}

      {cenas.carregando ? (
        <p className="suave">Carregando…</p>
      ) : total === 0 ? (
        <div className="cartao vazio">
          <p style={{ marginTop: 0 }}>Nenhuma cena cadastrada.</p>
          <p className="pequeno">Adicione um vídeo, cadastre os personagens e marque as falas. Depois publique para aparecer no app.</p>
          <Link className="botao botao-primario" to="/admin/cena/nova">
            + Adicionar o primeiro vídeo
          </Link>
        </div>
      ) : (
        <div className="cartao pilha" style={{ padding: 8 }}>
          {lista.map((c) => (
            <LinhaCena key={c.id} cena={c} aoMudar={cenas.recarregar} aoErro={setErro} />
          ))}
          {lista.length === 0 && <p className="suave" style={{ padding: 12 }}>Nenhuma cena com esse título.</p>}
        </div>
      )}

      <p className="suave pequeno" style={{ margin: 0 }}>
        As cenas ficam no servidor e aparecem para todos os usuários quando publicadas. Limite de 50 MB por arquivo.
      </p>
    </div>
  );
}

export default function Admin() {
  const { aberto, carregando } = useAdmin();
  if (carregando) return <p className="suave">Verificando acesso…</p>;
  return aberto ? <Painel /> : <TelaLogin />;
}

/** Vídeo novo que ficou pela metade no editor: oferece retomar. */
function AvisoRascunho() {
  const [r, setR] = useState<Rascunho | null>(null);
  useEffect(() => {
    void lerRascunho("nova").then((x) => setR(x ?? null));
  }, []);
  if (!r) return null;
  return (
    <div className="aviso-rascunho" role="alert">
      <div>
        <b>📝 Vídeo novo em edição</b>
        <span className="suave pequeno">
          {" "}
          {r.cena.titulo ? `“${r.cena.titulo}” · ` : ""}salvo em {quandoFoi(r.salvoEm)} · {r.cena.falas.length} falas
        </span>
      </div>
      <div className="linha" style={{ gap: 8 }}>
        <Link className="botao botao-primario" to="/admin/cena/nova?retomar=1">
          ↩ Retomar edição
        </Link>
        <button className="botao" onClick={() => void apagarRascunho("nova").then(() => setR(null))}>
          Descartar
        </button>
      </div>
    </div>
  );
}
