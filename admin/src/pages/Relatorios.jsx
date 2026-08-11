import { useState, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import api from '../lib/api'

const fmt = (v) => 'R$ ' + Number(v ?? 0).toFixed(2).replace('.', ',')

function hoje() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}

const PERIODOS = [
  { key: 'dia',    label: 'Dia' },
  { key: 'semana', label: 'Esta Semana' },
  { key: 'mes',    label: 'Este Mês' },
  { key: 'ano',    label: 'Este Ano' },
]

const GRAFICO_TIPOS = [
  { key: '7dias',   label: '7 dias' },
  { key: '30dias',  label: '30 dias' },
  { key: '12meses', label: '12 meses' },
  { key: 'inicio',  label: 'Desde o início' },
]

function StatCard({ label, value, sub, icon, highlight }) {
  return (
    <div className={`rounded-xl border shadow-sm p-4 ${highlight ? 'bg-brand text-white border-brand' : 'bg-white'}`}>
      <div className="flex items-center justify-between mb-2">
        <span className={`text-xs font-semibold uppercase tracking-wide ${highlight ? 'text-blue-200' : 'text-gray-400'}`}>
          {label}
        </span>
        <span className="text-xl">{icon}</span>
      </div>
      <div className={`text-2xl font-bold ${highlight ? 'text-white' : 'text-gray-800'}`}>{value}</div>
      {sub && (
        <div className={`text-xs mt-1 ${highlight ? 'text-blue-200' : 'text-gray-400'}`}>{sub}</div>
      )}
    </div>
  )
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm px-3 py-2 text-sm">
      <p className="text-gray-400 text-xs mb-0.5">{label}</p>
      <p className="font-bold text-gray-800">{fmt(payload[0].value)}</p>
    </div>
  )
}

function formatRange(geral, periodo) {
  if (!geral?.dataInicio) return ''
  const inicio = new Date(geral.dataInicio)
  const fmtD = (d) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })
  if (periodo === 'semana') {
    const fim = new Date(inicio)
    fim.setUTCDate(fim.getUTCDate() + 6)
    return `${fmtD(inicio)} – ${fmtD(fim)}`
  }
  if (periodo === 'mes') {
    return inicio.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' })
  }
  if (periodo === 'ano') {
    return inicio.toLocaleDateString('pt-BR', { year: 'numeric', timeZone: 'America/Sao_Paulo' })
  }
  return ''
}

export default function Relatorios() {
  const [periodo, setPeriodo] = useState('semana')
  const [diaData, setDiaData] = useState(hoje)
  const [geral, setGeral]     = useState(null)
  const [produtos, setProdutos] = useState([])
  const [sortBy, setSortBy]   = useState('receita')
  const [grafico, setGrafico] = useState([])
  const [graficoTipo, setGraficoTipo] = useState('7dias')
  const [loading, setLoading] = useState(true)
  const [loadingGrafico, setLoadingGrafico] = useState(true)
  const [err, setErr]         = useState('')

  const dataParam = periodo === 'dia' ? diaData : undefined

  const load = useCallback(async () => {
    setLoading(true)
    setErr('')
    try {
      const params = new URLSearchParams({ periodo })
      if (dataParam) params.set('data', dataParam)
      const [resGeral, resProdutos] = await Promise.all([
        api.get(`/api/admin/relatorios/geral?${params}`),
        api.get(`/api/admin/relatorios/produtos?${params}`),
      ])
      setGeral(resGeral.data)
      setProdutos(resProdutos.data)
    } catch {
      setErr('Erro ao carregar relatório')
    } finally {
      setLoading(false)
    }
  }, [periodo, dataParam])

  const loadGrafico = useCallback(async () => {
    setLoadingGrafico(true)
    try {
      const { data } = await api.get(`/api/admin/relatorios/grafico?tipo=${graficoTipo}`)
      setGrafico(data)
    } catch {
      // silent
    } finally {
      setLoadingGrafico(false)
    }
  }, [graficoTipo])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadGrafico() }, [loadGrafico])

  const sortedProdutos = [...produtos].sort((a, b) => b[sortBy] - a[sortBy])

  const range = formatRange(geral, periodo)

  return (
    <div>
      {/* Cabeçalho */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-brand">Relatórios</h1>
        <button
          onClick={load}
          className="text-xs text-brand-light border border-brand/30 px-3 py-1.5 rounded-lg hover:bg-brand/5"
        >
          ↻ Atualizar
        </button>
      </div>

      {/* Tabs de período */}
      <div className="flex items-center gap-3 mb-2 flex-wrap">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
          {PERIODOS.map((p) => (
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

        {/* Seletor de data para tab "Dia" */}
        {periodo === 'dia' && (
          <input
            type="date"
            value={diaData}
            max={hoje()}
            onChange={(e) => setDiaData(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
          />
        )}
      </div>

      {/* Range de datas */}
      {range && (
        <p className="text-sm text-gray-400 mb-5 font-medium">{range}</p>
      )}
      {!range && <div className="mb-5" />}

      {loading ? (
        <div className="text-center py-16 text-gray-400">Carregando…</div>
      ) : err ? (
        <div className="text-center py-16 text-red-400">{err}</div>
      ) : !geral ? null : (
        <div className="space-y-5">

          {/* 3 cards de resumo */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard
              label="Total Geral"
              value={fmt(geral.receitaGeral)}
              sub={`${geral.totalGeral} venda${geral.totalGeral !== 1 ? 's' : ''}`}
              icon="💰"
              highlight
            />
            <StatCard
              label="Balcão (PDV)"
              value={fmt(geral.receitaPDV)}
              sub={`${geral.totalPDV} comanda${geral.totalPDV !== 1 ? 's' : ''}`}
              icon="🏪"
            />
            <StatCard
              label="Delivery"
              value={fmt(geral.receitaDelivery)}
              sub={`${geral.totalDelivery} pedido${geral.totalDelivery !== 1 ? 's' : ''}`}
              icon="🛵"
            />
          </div>

          {/* Ticket médio */}
          {geral.totalGeral > 0 && (
            <div className="bg-white rounded-xl border shadow-sm px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">📊</span>
                <span className="text-sm text-gray-500 font-medium">Ticket médio</span>
              </div>
              <span className="font-bold text-gray-800 text-lg">{fmt(geral.ticketMedio)}</span>
            </div>
          )}

          {/* Produtos mais vendidos */}
          {sortedProdutos.length > 0 ? (
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2 flex-wrap">
                <span>🏆</span>
                <h3 className="font-semibold text-gray-700 text-sm">Produtos mais vendidos</h3>
                <span className="text-xs text-gray-400">{sortedProdutos.length} produto{sortedProdutos.length !== 1 ? 's' : ''}</span>
                {/* Sort toggle */}
                <div className="ml-auto flex gap-1 bg-gray-100 p-0.5 rounded-lg">
                  <button
                    onClick={() => setSortBy('receita')}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                      sortBy === 'receita' ? 'bg-white text-brand shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Por valor
                  </button>
                  <button
                    onClick={() => setSortBy('quantidade')}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                      sortBy === 'quantidade' ? 'bg-white text-brand shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Por qtd
                  </button>
                </div>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-2 text-xs text-gray-400 font-semibold w-8">#</th>
                    <th className="text-left px-4 py-2 text-xs text-gray-400 font-semibold">Produto</th>
                    <th className="text-right px-4 py-2 text-xs text-gray-400 font-semibold">Qtd</th>
                    <th className="text-right px-4 py-2 text-xs text-gray-400 font-semibold">Receita</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {sortedProdutos.map((p, i) => (
                    <tr key={p.nome} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-2.5 text-gray-300 text-xs font-mono">{i + 1}</td>
                      <td className="px-4 py-2.5 text-gray-800 font-medium">{p.nome}</td>
                      <td className="px-4 py-2.5 text-right text-gray-600 font-semibold">{p.quantidade}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-gray-800">{fmt(p.receita)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : geral.totalGeral === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <div className="text-4xl mb-2">📭</div>
              <p>Nenhuma venda no período</p>
            </div>
          ) : null}

        </div>
      )}

      {/* Gráfico de receita — independente do período selecionado */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden mt-5">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2 flex-wrap">
          <span>📈</span>
          <h3 className="font-semibold text-gray-700 text-sm">Receita ao longo do tempo</h3>
          <div className="ml-auto flex gap-1 bg-gray-100 p-0.5 rounded-lg">
            {GRAFICO_TIPOS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => setGraficoTipo(opt.key)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  graficoTipo === opt.key ? 'bg-white text-brand shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div className="p-4">
          {loadingGrafico ? (
            <div className="h-52 flex items-center justify-center text-gray-400 text-sm">Carregando…</div>
          ) : grafico.length === 0 ? (
            <div className="h-52 flex items-center justify-center text-gray-400 text-sm">Sem dados</div>
          ) : (
            <ResponsiveContainer width="100%" height={grafico.length > 15 ? 240 : 210}>
              <BarChart
                data={grafico}
                margin={{ top: 4, right: 4, bottom: grafico.length > 15 ? 40 : 0, left: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: grafico.length > 15 ? 10 : 11, fill: '#9ca3af' }}
                  axisLine={false}
                  tickLine={false}
                  angle={grafico.length > 15 ? -45 : 0}
                  textAnchor={grafico.length > 15 ? 'end' : 'middle'}
                  interval={0}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
                  width={36}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: '#f3f4f6' }} />
                <Bar dataKey="receita" fill="#4a90d9" radius={[4, 4, 0, 0]} maxBarSize={grafico.length > 15 ? 20 : 48} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  )
}
