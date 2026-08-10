import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'
import { tentarSincronizar } from '../lib/offline/sync'

export default function Login() {
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setErro('')
    setLoading(true)
    try {
      const { data } = await api.post('/api/pdv/auth/login', { senha })
      localStorage.setItem('dubon_pdv_token', data.token)
      tentarSincronizar()
      navigate('/', { replace: true })
    } catch (err) {
      setErro(err.response?.data?.error || 'Erro ao conectar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-8">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🍦</div>
          <h1 className="text-2xl font-bold text-brand">Dubon PDV</h1>
          <p className="text-slate-500 text-sm mt-1">Ponto de Venda — Balcão</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Senha</label>
            <input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="••••••••"
              className="w-full border border-slate-300 rounded-xl px-4 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-brand"
              autoFocus
            />
          </div>

          {erro && (
            <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {erro}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !senha}
            className="w-full bg-brand text-white font-semibold py-3 rounded-xl text-lg disabled:opacity-50 active:scale-95 transition-transform"
          >
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
