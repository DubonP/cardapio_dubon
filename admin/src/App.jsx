import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import Pedidos from './pages/Pedidos'
import Cardapio from './pages/Cardapio'
import Entregadores from './pages/Entregadores'
import Configuracoes from './pages/Configuracoes'
import Relatorios from './pages/Relatorios'

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
            <Route path="/configuracoes" element={<Configuracoes />} />
            <Route path="/relatorios" element={<Relatorios />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/pedidos" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
