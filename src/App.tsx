import { HashRouter, NavLink, Link, Route, Routes, Outlet } from "react-router-dom";
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
import { useAdmin } from "./admin";

function Layout() {
  const { aberto } = useAdmin();
  const plano = usePlano();
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
          {aberto && <NavLink to="/admin">Admin</NavLink>}
        </nav>
        <div className="atalhos-topo">
          {aberto && (
            <NavLink to="/admin" className="botao botao-pequeno">
              Admin
            </NavLink>
          )}
          <NavLink to="/conta" className={`botao botao-pequeno botao-premium ${plano.premium ? "eh-premium" : ""}`} aria-label="Minha conta e plano">
            {plano.premium ? "⭐ Premium" : "⭐ Seja Premium"}
          </NavLink>
          <NavLink to="/configuracoes" className="botao botao-pequeno botao-icone" aria-label="Configurações">
            ⚙️
          </NavLink>
        </div>
      </header>
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
          <Route path="premium" element={<Premium />} />
          <Route path="*" element={<NaoEncontrada />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
