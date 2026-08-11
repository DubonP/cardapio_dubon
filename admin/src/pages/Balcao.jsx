import { useState, useEffect, useCallback } from 'react'
import api from '../lib/api'

const fmt = (v) => 'R$ ' + Number(v ?? 0).toFixed(2).replace('.', ',')

const PERIODOS = [
  { key: 'dia',    label: 'Hoje' },
  { key: 'semana', label: 'Semana' },
  { key: 'mes',    label: 'Mês' },
  { key: 'ano',    label: 'Ano' },
]

const STATUS_OPTS = [
  { value: '',           label: 'Todas' },
  { value: 'ABERTO',     label: 'Abertas' },
  { value: 'FINALIZADO', label: 'Finalizadas' },
  { value: 'CANCELADO',  label: 'Canceladas' },
]

function tipoLabel(tipo) {
  const map = { KILO: 'Kilo', KILO_BOLO: 'Kilo Bolo', POTE: 'Pote', PICOLE: 'Picolé', BEBIDA: 'Bebida', CASQUINHA: 'Casquinha', TACA: 'Taça' }
  return map[tipo] || tipo
}

function pagamentoLabel(p) {
  return { DINHEIRO: '💵 Dinheiro', MAQUINA: '💳 Cartão', PIX: '📱 Pix' }[p] || null
}

function nomeComanda(c) {
  return (!c.clienteNome || c.clienteNome === '—') ? `#${c.id}` : c.clienteNome
}

function displayQtd(item) {
  if (item.tipo === 'KILO' || item.tipo === 'KILO_BOLO') {
    // KILO itens do PDV novo: quantidade=1, valor total direto
    if (item.quantidade <= 1) return '—'
    return `${item.quantidade}g`
  }
  return `${item.quantidade}×`
}

function StatusBadge({ status }) {
  const cls = {
    ABERTO:     'bg-emerald-100 text-emerald-700',
    FINALIZADO: 'bg-blue-100 text-blue-700',
    CANCELADO:  'bg-gray-100 text-gray-500',
  }[status] || 'bg-gray-100 text-gray-500'
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cls}`}>{status}</span>
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

function ComandaRow({ comanda, onToggle, expanded }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-800 truncate">{nomeComanda(comanda)}</span>
            <StatusBadge status={comanda.status} />
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            {comanda.itens.length} {comanda.itens.length === 1 ? 'item' : 'itens'} ·{' '}
            {new Date(comanda.criadoEm).toLocaleString('pt-BR', {
              day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
              timeZone: 'America/Sao_Paulo',
            })}
            {comanda.formaPagamento && (
              <span className="ml-2 text-gray-500">{pagamentoLabel(comanda.formaPagamento)}</span>
            )}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="font-bold text-gray-800">{fmt(comanda.total)}</p>
          <span className="text-gray-300 text-sm">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {expanded && comanda.itens.length > 0 && (
        <div className="border-t divide-y divide-gray-50 bg-gray-50">
          {comanda.itens.map((item) => (
            <div key={item.id} className="px-4 py-2 flex items-center gap-2 text-sm">
              <span className="text-xs bg-white border rounded px-1.5 py-0.5 text-gray-500 shrink-0">
                {tipoLabel(item.tipo)}
              </span>
              <span className="flex-1 text-gray-700 truncate">{item.descricao}</span>
              <span className="text-gray-400 shrink-0">{displayQtd(item)}</span>
              <span className="font-medium text-gray-700 shrink-0">{fmt(item.valorTotal)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Balcao() {
  const [periodo, setPeriodo] = useState('dia')
  const [stats, setStats] = useState(null)
  const [loadingStats, setLoadingStats] = useState(true)

  const [statusFiltro, setStatusFiltro] = useState('')
  const [page, setPage] = useState(1)
  const [listData, setListData] = useState(null)
  const [loadingList, setLoadingList] = useState(true)

  const [expanded, setExpanded] = useState(null)
  const [err, setErr] = useState('')

  const loadStats = useCallback(async () => {
    setLoadingStats(true)
    try {
      const { data } = await api.get(`/api/admin/balcao/stats?periodo=${periodo}`)
      setStats(data)
    } catch {
      setErr('Erro ao carregar estatísticas')
    } finally {
      setLoadingStats(false)
    }
  }, [periodo])

  const loadList = useCallback(async () => {
    setLoadingList(true)
    try {
      const params = new URLSearchParams({ page })
      if (statusFiltro) params.set('status', statusFiltro)
      const { data } = await api.get(`/api/admin/balcao/comandas?${params}`)
      setListData(data)
    } catch {
      setErr('Erro ao carregar comandas')
    } finally {
      setLoadingList(false)
    }
  }, [statusFiltro, page])

  useEffect(() => { loadStats() }, [loadStats])
  useEffect(() => { setPage(1) }, [statusFiltro])
  useEffect(() => { loadList() }, [loadList])

  function toggleExpanded(id) {
    setExpanded((prev) => (prev === id ? null : id))
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Balcão (PDV)</h1>
        <button
          onClick={() => { loadStats(); loadList() }}
          className="text-xs text-brand border border-brand/30 px-3 py-1.5 rounded-lg hover:bg-brand/5"
        >
          ↻ Atualizar
        </button>
      </div>

      {err && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2.5 mb-4">{err}</div>
      )}

      {/* Estatísticas */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit mb-4">
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

      {loadingStats ? (
        <div className="text-center py-6 text-gray-400 text-sm">Carregando…</div>
      ) : stats && (
        <div className="mb-6 space-y-3">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Comandas finalizadas" value={stats.totalComandas} icon="✅" />
            <StatCard label="Receita balcão" value={fmt(stats.receita)} icon="💰" />
            <StatCard label="Ticket médio" value={fmt(stats.ticketMedio)} icon="📊" />
            <StatCard label="Abertas agora" value={stats.abertas} icon="📋" />
          </div>
          {stats.maisVendido && (
            <div className="bg-white rounded-xl shadow-sm border p-4 flex items-center gap-4">
              <span className="text-2xl">🏆</span>
              <div>
                <div className="text-xs text-gray-400 font-medium">Mais vendido no balcão</div>
                <div className="font-semibold text-gray-800">{stats.maisVendido}</div>
                <div className="text-xs text-gray-500">{stats.maisVendidoQtd} un/g</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Lista de comandas */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-gray-700">Comandas</h2>
        <div className="flex gap-1 bg-gray-100 p-0.5 rounded-lg">
          {STATUS_OPTS.map(o => (
            <button
              key={o.value}
              onClick={() => setStatusFiltro(o.value)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                statusFiltro === o.value ? 'bg-white text-brand shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {loadingList ? (
        <div className="text-center py-8 text-gray-400 text-sm">Carregando…</div>
      ) : !listData || listData.comandas.length === 0 ? (
        <div className="text-center py-8 text-gray-400">Nenhuma comanda encontrada</div>
      ) : (
        <>
          <div className="space-y-2 mb-4">
            {listData.comandas.map((c) => (
              <ComandaRow
                key={c.id}
                comanda={c}
                expanded={expanded === c.id}
                onToggle={() => toggleExpanded(c.id)}
              />
            ))}
          </div>

          {listData.pages > 1 && (
            <div className="flex justify-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 disabled:opacity-40"
              >
                ← Anterior
              </button>
              <span className="px-3 py-1.5 text-sm text-gray-500">{page} / {listData.pages}</span>
              <button
                onClick={() => setPage((p) => Math.min(listData.pages, p + 1))}
                disabled={page === listData.pages}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 disabled:opacity-40"
              >
                Próxima →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
