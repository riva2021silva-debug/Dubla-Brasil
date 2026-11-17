import { useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { criarPin, entrar, sair, trocarPin, useAdmin } from "../admin";
import { Capa } from "../componentes/CartaoCena";
import { db, excluirCenaCompleta } from "../db";
import { todasAsCenas, useCarregar } from "../ganchos";
import { exportarPacote, importarPacote } from "../pacote";
import { estaPublicada, type Cena } from "../tipos";
import { baixarArquivo, dataCurta, formatarTempo, nomeArquivo } from "../util";

/** Protege uma página: só abre com o modo administrador desbloqueado. */
export function SoAdmin({ children }: { children: React.ReactNode }) {
  const { aberto } = useAdmin();
  return aberto ? <>{children}</> : <Navigate to="/admin" replace />;
}

function TelaPin() {
  const { temPin } = useAdmin();
  const [pin, setPin] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErro(null);
    if (!/^\d{4,8}$/.test(pin)) return setErro("O PIN precisa ter de 4 a 8 números.");
    if (!temPin) {
      if (pin !== confirmacao) return setErro("Os dois PINs não são iguais.");
      await criarPin(pin);
    } else if (!(await entrar(pin))) {
      setPin("");
      return setErro("PIN incorreto.");
    }
  };

  return (
    <form className="cartao pilha" style={{ maxWidth: 420, margin: "40px auto" }} onSubmit={enviar}>
      <h1 style={{ fontSize: "1.8rem" }}>Área do administrador</h1>
      <p className="suave" style={{ margin: 0 }}>
        {temPin
          ? "Digite o seu PIN para gerenciar as cenas."
          : "Crie um PIN para proteger a área do administrador neste aparelho. Guarde-o: ele é pedido sempre que você entrar."}
      </p>
      <label className="campo">
        {temPin ? "PIN" : "Novo PIN (4 a 8 números)"}
        <input id="pin" className="entrada" type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} autoFocus />
      </label>
      {!temPin && (
        <label className="campo">
          Repita o PIN
          <input id="pin-confirmacao" className="entrada" type="password" inputMode="numeric" autoComplete="off" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value.replace(/\D/g, ""))} />
        </label>
      )}
      {erro && <p className="alerta" style={{ margin: 0 }}>{erro}</p>}
      <button className="botao botao-primario" type="submit">
        {temPin ? "Entrar" : "Criar PIN e entrar"}
      </button>
    </form>
  );
}

function TrocarPin() {
  const [aberto, setAberto] = useState(false);
  const [atual, setAtual] = useState("");
  const [novo, setNovo] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  if (!aberto)
    return (
      <button className="botao botao-pequeno" onClick={() => setAberto(true)}>
        Trocar PIN
      </button>
    );
  return (
    <form
      className="linha"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!/^\d{4,8}$/.test(novo)) return setMsg({ ok: false, texto: "O novo PIN precisa ter de 4 a 8 números." });
        const ok = await trocarPin(atual, novo);
        setMsg(ok ? { ok: true, texto: "PIN trocado." } : { ok: false, texto: "PIN atual incorreto." });
        if (ok) {
          setAtual("");
          setNovo("");
          setTimeout(() => setAberto(false), 1200);
        }
      }}
    >
      <input id="pin-atual" className="entrada" style={{ width: 130 }} type="password" inputMode="numeric" placeholder="PIN atual" value={atual} onChange={(e) => setAtual(e.target.value.replace(/\D/g, ""))} />
      <input id="pin-novo" className="entrada" style={{ width: 130 }} type="password" inputMode="numeric" placeholder="Novo PIN" value={novo} onChange={(e) => setNovo(e.target.value.replace(/\D/g, ""))} />
      <button className="botao botao-pequeno" type="submit">
        Salvar
      </button>
      {msg && <span className="pequeno" style={{ color: msg.ok ? "var(--verde)" : "var(--perigo)" }}>{msg.texto}</span>}
    </form>
  );
}

function LinhaCena({ cena, aoMudar }: { cena: Cena; aoMudar: () => void }) {
  const [confirmar, setConfirmar] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const publicada = estaPublicada(cena);
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
        <button
          className={`botao botao-pequeno ${publicada ? "" : "botao-verde"}`}
          onClick={async () => {
            await db.salvarCena({ ...cena, publicada: !publicada, atualizadaEm: Date.now() });
            aoMudar();
          }}
        >
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
          onClick={async () => {
            setOcupado(true);
            try {
              await baixarArquivo(await exportarPacote(cena), `${nomeArquivo(cena.titulo)}.dubla`);
            } finally {
              setOcupado(false);
            }
          }}
        >
          📦
        </button>
        {confirmar ? (
          <>
            <button
              className="botao botao-pequeno botao-perigo"
              onClick={async () => {
                await excluirCenaCompleta(cena);
                aoMudar();
              }}
            >
              Confirmar exclusão
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

function Painel() {
  const cenas = useCarregar(() => todasAsCenas(true), []);
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
        <div>
          <h1 style={{ margin: 0 }}>Administração</h1>
          <p className="suave" style={{ margin: 0 }}>
            {total} {total === 1 ? "cena" : "cenas"} · {publicadas} {publicadas === 1 ? "publicada" : "publicadas"} · {total - publicadas}{" "}
            {total - publicadas === 1 ? "oculta" : "ocultas"}
          </p>
        </div>
        <div className="linha">
          <button className="botao" onClick={() => arquivo.current?.click()} disabled={importando}>
            {importando ? "Importando…" : "📦 Importar pacote"}
          </button>
          <Link className="botao botao-primario" to="/admin/cena/nova">
            + Adicionar vídeo
          </Link>
        </div>
      </div>
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
            setErro(err instanceof Error ? err.message : String(err));
          } finally {
            setImportando(false);
          }
        }}
      />
      {erro && <p className="alerta">{erro}</p>}

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
            <LinhaCena key={c.id} cena={c} aoMudar={cenas.recarregar} />
          ))}
          {lista.length === 0 && <p className="suave" style={{ padding: 12 }}>Nenhuma cena com esse título.</p>}
        </div>
      )}

      <div className="linha entre" style={{ marginTop: 8 }}>
        <TrocarPin />
        <button className="botao botao-pequeno" onClick={sair}>
          🔒 Sair do modo administrador
        </button>
      </div>
      <p className="suave pequeno" style={{ margin: 0 }}>
        As cenas ficam guardadas neste aparelho. Para levar uma cena para outro aparelho, use 📦 para exportar o pacote e
        “Importar pacote” no outro.
      </p>
    </div>
  );
}

export default function Admin() {
  const { aberto } = useAdmin();
  return aberto ? <Painel /> : <TelaPin />;
}
