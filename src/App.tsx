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
import { useAdmin } from "./admin";

function Layout() {
  const { aberto } = useAdmin();
  return (
    <>
      <header className="topo">
        <Link to="/" className="marca" aria-label="Dubla Brasil AI, início">
          <img src="marca/logo-pequeno.webp" alt="Dubla Brasil AI" width={69} height={46} />
        </Link>
        <nav className="nav">
          <NavLink to="/cenas">Cenas</NavLink>
          <NavLink to="/meus-dubs">Meus dubs</NavLink>
          <NavLink to="/configuracoes">Configurações</NavLink>
          {aberto && <NavLink to="/admin">Admin</NavLink>}
        </nav>
      </header>
      <main className="pagina">
        <Outlet />
      </main>
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
          <Route path="admin" element={<Admin />} />
          <Route path="admin/cena/nova" element={<SoAdmin><Editor /></SoAdmin>} />
          <Route path="admin/cena/:id" element={<SoAdmin><Editor /></SoAdmin>} />
          <Route path="configuracoes" element={<Configuracoes />} />
          <Route path="*" element={<NaoEncontrada />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
