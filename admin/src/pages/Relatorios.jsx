import { useState, useEffect, useCallback } from 'react'
import api from '../lib/api'

const fmt = (v) => 'R$ ' + Number(v ?? 0).toFixed(2).replace('.', ',')

const PERIODOS = [
  { key: 'dia',    label: 'Hoje' },
  { key: 'semana', label: 'Semana' },
  { key: 'mes',    label: 'Mês' },
  { key: 'ano',    label: 'Ano' },
]

export default function Relatorios() {
  const [periodo, setPeriodo] = useState('dia')
  const [geral, setGeral] = useState(null)
  const [entregas, setEntregas] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setErr('')
    try {
      const [resGeral, resEntregas] = await Promise.all([
        api.get(`/api/admin/relatorios/geral?periodo=${periodo}`),
        api.get(`/api/admin/relatorios/entregas?periodo=${periodo}`),
      ])
      setGeral(resGeral.data)
      setEntregas(resEntregas.data)
    } catch {
      setErr('Erro ao carregar relatório')
    } finally {
      setLoading(false)
    }
  }, [periodo])

  useEffect(() => { load() }, [load])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Relatórios</h1>
        <button onClick={load} className="text-xs text-brand border border-brand/30 px-3 py-1.5 rounded-lg hover:bg-brand/5">
          ↻ Atualizar
        </button>
      </div>

      {/* Period tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit mb-6">
        {PERIODOS.map(p => (
          <button
            key={p.key}
            onClick={() => setPeriodo(p.key)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              periodo === p.key ? 'bg-white text-brand shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">Carregando…</div>
      ) : err ? (
        <div className="text-center py-16 text-red-400">{err}</div>
      ) : (
        <RelatorioContent geral={geral} entregas={entregas} />
      )}
    </div>
  )
}

function RelatorioContent({ geral, entregas }) {
  if (!geral) return null

  const {
    totalPedidos = 0,
    receita = 0,
    ticketMedio = 0,
    produtoMaisVendido,
    quantidadeProdutoMaisVendido = 0,
  } = geral

  const totalEntregas  = entregas.reduce((s, r) => s + r.total_entregas, 0)
  const totalRetiradas = entregas.reduce((s, r) => s + r.total_retiradas, 0)

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Pedidos" value={totalPedidos} icon="📋" />
        <StatCard label="Total vendido" value={fmt(receita)} icon="💰" />
        <StatCard label="Ticket médio" value={fmt(ticketMedio)} icon="📊" />
        <StatCard label="Entregas" value={totalEntregas} icon="🛵" />
      </div>

      {produtoMaisVendido && (
        <div className="bg-white rounded-xl shadow-sm border p-4 flex items-center gap-4">
          <span className="text-2xl">🏆</span>
          <div>
            <div className="text-xs text-gray-400 font-medium">Produto mais vendido</div>
            <div className="font-semibold text-gray-800">{produtoMaisVendido}</div>
            <div className="text-xs text-gray-500">{quantidadeProdutoMaisVendido} unidades</div>
          </div>
        </div>
      )}

      {/* Entregas/retiradas */}
      {(totalEntregas > 0 || totalRetiradas > 0) && (
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Deliveries" value={totalEntregas} icon="🚴" />
          <StatCard label="Retiradas" value={totalRetiradas} icon="🏪" />
        </div>
      )}

      {/* Daily breakdown table */}
      {entregas.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <h3 className="font-semibold text-gray-700 mb-3 text-sm flex items-center gap-2">
            <span>📅</span>
            <span>Detalhe por dia</span>
          </h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 border-b">
                <th className="text-left pb-2">Data</th>
                <th className="text-right pb-2">Pedidos</th>
                <th className="text-right pb-2">Entregas</th>
                <th className="text-right pb-2">Retiradas</th>
                <th className="text-right pb-2">Receita</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {entregas.map(row => (
                <tr key={row.data}>
                  <td className="py-2 text-gray-700">{formatDate(row.data)}</td>
                  <td className="py-2 text-right text-gray-600">{row.total_pedidos}</td>
                  <td className="py-2 text-right text-gray-600">{row.total_entregas}</td>
                  <td className="py-2 text-right text-gray-600">{row.total_retiradas}</td>
                  <td className="py-2 text-right font-medium text-gray-800">{fmt(row.receita)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPedidos === 0 && (
        <div className="text-center py-8 text-gray-400">Nenhum pedido no período</div>
      )}
    </div>
  )
}

function StatCard({ label, value, icon }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-400 font-medium">{label}</span>
        <span className="text-lg">{icon}</span>
      </div>
      <div className="text-xl font-bold text-gray-800">{value}</div>
    </div>
  )
}

function formatDate(iso) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
