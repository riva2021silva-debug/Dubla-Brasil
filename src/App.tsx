import { HashRouter, NavLink, Link, Route, Routes, Outlet } from "react-router-dom";
import Inicio from "./paginas/Inicio";
import Biblioteca from "./paginas/Biblioteca";
import EscolherPapel from "./paginas/EscolherPapel";
import Estudio from "./paginas/Estudio";
import Sessao from "./paginas/Sessao";
import MeusDubs from "./paginas/MeusDubs";
import Editor from "./paginas/Editor";
import Configuracoes from "./paginas/Configuracoes";

function Layout() {
  return (
    <>
      <header className="topo">
        <Link to="/" className="marca" aria-label="Dubla Brasil, início">
          <span className="marca-selo" aria-hidden />
          <span>
            Dubla <b>Brasil</b>
          </span>
        </Link>
        <nav className="nav">
          <NavLink to="/cenas">Cenas</NavLink>
          <NavLink to="/meus-dubs">Meus dubs</NavLink>
          <NavLink to="/editor">Criar cena</NavLink>
          <NavLink to="/configuracoes">Configurações</NavLink>
        </nav>
      </header>
      <main className="pagina">
        <Outlet />
      </main>
      <footer className="rodape">
        Dubla Brasil · tudo fica salvo só neste navegador · use apenas vídeos que você tem direito de usar
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
          <Route path="editor" element={<Editor />} />
          <Route path="editor/:id" element={<Editor />} />
          <Route path="configuracoes" element={<Configuracoes />} />
          <Route path="*" element={<NaoEncontrada />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
