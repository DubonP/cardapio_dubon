import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import Pedidos from './pages/Pedidos'
import Cardapio from './pages/Cardapio'
import Entregadores from './pages/Entregadores'
import Configuracoes from './pages/Configuracoes'
import Relatorios from './pages/Relatorios'
import Balcao from './pages/Balcao'
import Caixa from './pages/Caixa'
import Cartao from './pages/Cartao'
import { isAdmin } from './lib/auth'

function RequireAdmin() {
  return isAdmin() ? <Outlet /> : <Navigate to="/pedidos" replace />
}

export default function App() {
  return (
    <BrowserRouter basename="/admin">
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route index element={<Navigate to="/pedidos" replace />} />
            <Route path="/pedidos" element={<Pedidos />} />
            <Route path="/cardapio" element={<Cardapio />} />
            <Route path="/entregadores" element={<Entregadores />} />
            <Route path="/cartao" element={<Cartao />} />
            <Route element={<RequireAdmin />}>
              <Route path="/balcao" element={<Balcao />} />
              <Route path="/caixa" element={<Caixa />} />
              <Route path="/configuracoes" element={<Configuracoes />} />
              <Route path="/relatorios" element={<Relatorios />} />
            </Route>
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/pedidos" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
