import { HashRouter, NavLink, Link, Route, Routes, Outlet, useLocation } from "react-router-dom";
import Inicio from "./paginas/Inicio";
import Biblioteca from "./paginas/Biblioteca";
import EscolherPapel from "./paginas/EscolherPapel";
import Estudio from "./paginas/Estudio";
import Sessao from "./paginas/Sessao";
import MeusDubs from "./paginas/MeusDubs";
import Editor from "./paginas/Editor";
import Configuracoes from "./paginas/Configuracoes";
import Admin, { SoAdmin } from "./paginas/Admin";
import Imitacao from "./paginas/Imitacao";
import ImitarSom from "./paginas/ImitarSom";
import Jogos from "./paginas/Jogos";
import VozNoAlvo from "./paginas/VozNoAlvo";
import Galeria from "./paginas/Galeria";
import Premium, { Conta } from "./paginas/Premium";
import { usePlano } from "./plano";
import AvisoAtualizacao from "./componentes/AvisoAtualizacao";
import AvisoBaixarApp from "./componentes/AvisoBaixarApp";
import Ajuda from "./paginas/Ajuda";
import { useEffect, useState } from "react";
import { contarNovas } from "./ajuda";
import { vigiarSeloExterno } from "./seloExterno";
import { useAdmin } from "./admin";
import Notificacoes from "./paginas/Notificacoes";
import { useNaoLidas } from "./notificacoes";
import { useAvisoEspaco } from "./espaco";
import { emAndamento, iniciarProcessamento, pausarProcessamento, useProcessamento } from "./processamento";

function Layout() {
  const { aberto } = useAdmin();
  const plano = usePlano();
  const espaco = useAvisoEspaco(aberto);
  const naoLidas = useNaoLidas() + (espaco?.avisar ? 1 : 0);
  // Cenas salvas pelo admin: a fila automática roda em segundo plano (em qualquer tela do app).
  const processando = emAndamento(useProcessamento()).length;
  useEffect(() => {
    if (aberto) void iniciarProcessamento();
  }, [aberto]);
  // No estúdio e no resultado a IA pesada espera (a dublagem não pode picotar) e volta sozinha ao sair.
  const { pathname } = useLocation();
  useEffect(() => pausarProcessamento(/^\/(estudio|dub)\//.test(pathname)), [pathname]);
  // Selo de fora (ex.: "Powered by Netlify"): a barra de botões sobe para não ficar por baixo dele.
  useEffect(() => vigiarSeloExterno(), []);
  // Administrador: quantas mensagens de Ajuda estão esperando (aparece no botão Admin).
  const [novas, setNovas] = useState(0);
  useEffect(() => {
    if (!aberto) return setNovas(0);
    const contar = () => void contarNovas().then(setNovas);
    contar();
    const t = setInterval(contar, 60_000);
    window.addEventListener("dubla:mensagens-mudaram", contar);
    return () => {
      clearInterval(t);
      window.removeEventListener("dubla:mensagens-mudaram", contar);
    };
  }, [aberto]);
  return (
    <>
      <header className="topo">
        <Link to="/" className="marca" aria-label="Dubla Brasil AI, início">
          <img src="marca/logo-pequeno.webp" alt="Dubla Brasil AI" width={69} height={46} />
        </Link>
        <nav className="nav" aria-label="Menu principal">
          <NavLink to="/cenas">Cenas</NavLink>
          <NavLink to="/galeria">Galeria</NavLink>
          <NavLink to="/imitar">Imitação</NavLink>
          <NavLink to="/jogos">Jogos</NavLink>
          <NavLink to="/meus-dubs">Meus dubs</NavLink>
          <NavLink to="/configuracoes">Configurações</NavLink>
          {aberto && (
            <NavLink to={espaco?.avisar ? "/admin?aba=galeria" : "/admin"} aria-label={espaco?.avisar ? "Admin, hora de liberar espaço" : undefined}>
              Admin{espaco?.avisar && <span aria-hidden> 🧹</span>}
              {processando > 0 && <span className="selo-processando" aria-label={`preparando ${processando}`}>⏳{processando}</span>}
            </NavLink>
          )}
        </nav>
        <div className="atalhos-topo">
          {aberto && (
            <NavLink
              to={espaco?.avisar ? "/admin?aba=galeria" : "/admin"}
              className="botao botao-pequeno"
              aria-label={[novas ? `Admin, ${novas} mensagens novas` : "Admin", espaco?.avisar ? "hora de liberar espaço" : ""].filter(Boolean).join(", ")}
            >
              Admin{espaco?.avisar && <span aria-hidden> 🧹</span>}
              {processando > 0 && (
                <span className="selo-processando" title={`Preparando ${processando} ${processando === 1 ? "cena" : "cenas"}`} aria-label={`preparando ${processando}`}>
                  ⏳{processando}
                </span>
              )}
              {novas > 0 && <span className="selo-novas">{novas}</span>}
            </NavLink>
          )}
          <NavLink to="/conta" className={`botao botao-pequeno botao-premium ${plano.premium ? "eh-premium" : ""}`} aria-label="Minha conta e plano">
            ⭐<span className="texto-premium">{plano.premium ? " Premium" : " Seja Premium"}</span>
          </NavLink>
          <NavLink to="/notificacoes" className="botao botao-pequeno botao-icone sino" aria-label={naoLidas ? `Notificações, ${naoLidas} novas` : "Notificações"}>
            🔔{naoLidas > 0 && <span className="selo-novas selo-sino">{naoLidas > 9 ? "9+" : naoLidas}</span>}
          </NavLink>
          <NavLink to="/ajuda" className="botao botao-pequeno botao-icone" aria-label="Ajuda">
            ❓
          </NavLink>
          <NavLink to="/configuracoes" className="botao botao-pequeno botao-icone" aria-label="Configurações">
            ⚙️
          </NavLink>
        </div>
      </header>
      <AvisoBaixarApp />
      <main className="pagina">
        <Outlet />
      </main>
      <AvisoAtualizacao />
      <nav className="barra-inferior" aria-label="Menu">
        {[
          ["/cenas", "🎬", "Cenas"],
          ["/galeria", "🌎", "Galeria"],
          ["/imitar", "🦜", "Imitar"],
          ["/jogos", "🎯", "Jogos"],
          ["/meus-dubs", "🎙️", "Meus dubs"],
        ].map(([para, icone, nome]) => (
          <NavLink key={para} to={para} end={para === "/"}>
            <span aria-hidden>{icone}</span>
            {nome}
          </NavLink>
        ))}
      </nav>
      <footer className="rodape">
        Dubla Brasil AI · Sua voz. Seu talento. Sua dublagem. · <Link to="/admin">Área do administrador</Link>
      </footer>
    </>
  );
}

function NaoEncontrada() {
  return (
    <div className="vazio">
      <h2>Página não encontrada</h2>
      <Link className="botao" to="/">
        Voltar ao início
      </Link>
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Inicio />} />
          <Route path="cenas" element={<Biblioteca />} />
          <Route path="cena/:id" element={<EscolherPapel />} />
          <Route path="estudio/:dubId" element={<Estudio />} />
          <Route path="dub/:dubId" element={<Sessao />} />
          <Route path="meus-dubs" element={<MeusDubs />} />
          <Route path="galeria" element={<Galeria />} />
          <Route path="imitar" element={<Imitacao />} />
          <Route path="imitar/:id" element={<ImitarSom />} />
          <Route path="jogos" element={<Jogos />} />
          <Route path="jogos/voz-no-alvo" element={<VozNoAlvo />} />
          <Route path="admin" element={<Admin />} />
          <Route path="admin/cena/nova" element={<SoAdmin><Editor /></SoAdmin>} />
          <Route path="admin/cena/:id" element={<SoAdmin><Editor /></SoAdmin>} />
          <Route path="configuracoes" element={<Configuracoes />} />
          <Route path="conta" element={<Conta />} />
          <Route path="ajuda" element={<Ajuda />} />
          <Route path="notificacoes" element={<Notificacoes />} />
          <Route path="premium" element={<Premium />} />
          <Route path="*" element={<NaoEncontrada />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
