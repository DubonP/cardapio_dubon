import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import PDV from './pages/PDV'
import Comanda from './pages/Comanda'
import Historico from './pages/Historico'
import Debug from './pages/Debug'
import DeviceRoleGate from './components/DeviceRoleGate'
import './lib/offline/sync'

function ProtectedRoute({ children }) {
  const token = localStorage.getItem('dubon_pdv_token')
  if (!token) return <Navigate to="/login" replace />
  return <DeviceRoleGate>{children}</DeviceRoleGate>
}

export default function App() {
  return (
    <BrowserRouter basename="/pdv">
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<ProtectedRoute><PDV /></ProtectedRoute>} />
        <Route path="/comanda/:id" element={<ProtectedRoute><Comanda /></ProtectedRoute>} />
        <Route path="/historico" element={<ProtectedRoute><Historico /></ProtectedRoute>} />
        <Route path="/debug" element={<ProtectedRoute><Debug /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
