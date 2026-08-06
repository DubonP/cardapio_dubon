import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'

function fmt(valor) {
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function Historico() {
  const navigate = useNavigate()
  const [comandas, setComandas] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/pdv/comandas/historico?status=FINALIZADO&take=6')
      .then((r) => setComandas(r.data.comandas))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-brand text-white px-4 py-3 flex items-center gap-3 shadow-md sticky top-0 z-10">
        <button onClick={() => navigate('/')} className="text-white/80 text-2xl leading-none">←</button>
        <h1 className="font-bold text-lg">Últimas finalizadas</h1>
      </header>

      <main className="p-4 max-w-xl mx-auto space-y-3">
        {loading ? (
          <p className="text-center text-slate-400 py-12">Carregando…</p>
        ) : comandas.length === 0 ? (
          <p className="text-center text-slate-400 py-12">Nenhuma comanda finalizada</p>
        ) : (
          comandas.map((c) => (
            <div key={c.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold text-slate-800 text-lg truncate">
                    {(!c.clienteNome || c.clienteNome === '—') ? `#${c.id}` : c.clienteNome}
                  </p>
                  <p className="text-base text-slate-500 mt-0.5">
                    {c.itens.length} {c.itens.length === 1 ? 'item' : 'itens'} ·{' '}
                    {new Date(c.criadoEm).toLocaleDateString('pt-BR', {
                      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                    })}
                  </p>
                </div>
                <p className="font-bold text-slate-700 text-lg shrink-0">{fmt(c.total)}</p>
              </div>
            </div>
          ))
        )}
      </main>
    </div>
  )
}
