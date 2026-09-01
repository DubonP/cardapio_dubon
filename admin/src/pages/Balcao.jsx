import { useState, useEffect, useCallback } from 'react'
import api from '../lib/api'
import Modal from '../components/Modal'

const fmt = (v) => 'R$ ' + Number(v ?? 0).toFixed(2).replace('.', ',')
// Destaque visual pra achar erro de digitação rápido (ex: 2875 em vez de 28,75).
const LIMITE_DESTAQUE = 500

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  )
}

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

function ComandaRow({ comanda, onToggle, expanded, onEditarItem, onRemoverItem, onRemoverComanda }) {
  const totalAlto = Number(comanda.total) >= LIMITE_DESTAQUE
  return (
    <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
      <div className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors">
        <button onClick={onToggle} className="flex-1 min-w-0 text-left">
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
        </button>
        <button onClick={onToggle} className="text-right shrink-0">
          <p className={`font-bold ${totalAlto ? 'text-emerald-600' : 'text-gray-800'}`}>{fmt(comanda.total)}</p>
          <span className="text-gray-300 text-sm">{expanded ? '▲' : '▼'}</span>
        </button>
        <button
          onClick={() => onRemoverComanda(comanda.id)}
          title="Excluir comanda inteira"
          className="text-gray-300 hover:text-red-400 p-1 shrink-0"
        >
          🗑️
        </button>
      </div>

      {expanded && comanda.itens.length > 0 && (
        <div className="border-t divide-y divide-gray-50 bg-gray-50">
          {comanda.itens.map((item) => {
            const itemAlto = Number(item.valorTotal) >= LIMITE_DESTAQUE
            return (
              <div key={item.id} className="px-4 py-2 flex items-center gap-2 text-sm">
                <span className="text-xs bg-white border rounded px-1.5 py-0.5 text-gray-500 shrink-0">
                  {tipoLabel(item.tipo)}
                </span>
                <span className="flex-1 text-gray-700 truncate">{item.descricao}</span>
                <span className="text-gray-400 shrink-0">{displayQtd(item)}</span>
                <span className={`font-medium shrink-0 ${itemAlto ? 'text-emerald-600 font-bold' : 'text-gray-700'}`}>
                  {fmt(item.valorTotal)}
                </span>
                <button onClick={() => onEditarItem(item)} className="text-gray-300 hover:text-gray-600 p-1 shrink-0">✏️</button>
                <button onClick={() => onRemoverItem(item.id)} className="text-gray-300 hover:text-red-400 p-1 shrink-0">🗑️</button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ItemEditModal({ item, onClose, onSave }) {
  const [form, setForm] = useState({
    descricao: item.descricao,
    quantidade: String(item.quantidade),
    valorUnitario: String(item.valorUnitario),
  })
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })) }

  const semMultiplicar = ['KILO', 'KILO_BOLO', 'OUTROS'].includes(item.tipo)
  const qtdNum = parseFloat(String(form.quantidade).replace(',', '.')) || 0
  const valorNum = parseFloat(String(form.valorUnitario).replace(',', '.')) || 0
  const previewTotal = semMultiplicar ? valorNum : valorNum * qtdNum

  async function salvar() {
    setErro('')
    if (!form.descricao.trim()) { setErro('Informe a descrição'); return }
    if (!qtdNum || qtdNum <= 0) { setErro('Quantidade inválida'); return }
    if (!valorNum || valorNum <= 0) { setErro('Valor inválido'); return }
    setSaving(true)
    try {
      await onSave(item.id, { descricao: form.descricao.trim(), quantidade: qtdNum, valorUnitario: valorNum })
      onClose()
    } catch (err) {
      setErro(err.response?.data?.error || 'Erro ao salvar')
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Editar item"
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancelar</button>
          <button
            onClick={salvar}
            disabled={saving}
            className="px-4 py-2 text-sm bg-brand text-white rounded-lg font-medium disabled:opacity-50"
          >
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Descrição">
          <input className="input" value={form.descricao} onChange={(e) => set('descricao', e.target.value)} autoFocus />
        </Field>
        {!semMultiplicar && (
          <Field label="Quantidade">
            <input className="input" type="number" min="0" step="1" value={form.quantidade} onChange={(e) => set('quantidade', e.target.value)} />
          </Field>
        )}
        <Field label={semMultiplicar ? 'Valor total (R$)' : 'Valor unitário (R$)'}>
          <input className="input" type="number" min="0" step="0.01" value={form.valorUnitario} onChange={(e) => set('valorUnitario', e.target.value)} />
        </Field>
        <p className="text-sm text-gray-500">
          Total do item: <span className="font-bold text-gray-800">{fmt(previewTotal)}</span>
        </p>
        {erro && <p className="text-red-600 text-sm">{erro}</p>}
      </div>
    </Modal>
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
  const [itemEditando, setItemEditando] = useState(null)

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

  async function salvarItem(itemId, dados) {
    const { data } = await api.patch(`/api/admin/balcao/itens/${itemId}`, dados)
    setListData((prev) => ({
      ...prev,
      comandas: prev.comandas.map((c) => (c.id === data.id ? data : c)),
    }))
    loadStats()
  }

  async function removerItem(itemId) {
    if (!window.confirm('Remover este item da comanda?')) return
    try {
      const { data } = await api.delete(`/api/admin/balcao/itens/${itemId}`)
      setListData((prev) => ({
        ...prev,
        comandas: prev.comandas.map((c) => (c.id === data.id ? data : c)),
      }))
      loadStats()
    } catch {
      setErr('Erro ao remover item')
    }
  }

  async function removerComanda(comandaId) {
    if (!window.confirm('Excluir esta comanda inteira? Essa ação não pode ser desfeita.')) return
    try {
      await api.delete(`/api/admin/balcao/comandas/${comandaId}`)
      setListData((prev) => ({
        ...prev,
        comandas: prev.comandas.filter((c) => c.id !== comandaId),
        total: prev.total - 1,
      }))
      loadStats()
    } catch {
      setErr('Erro ao remover comanda')
    }
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
                onEditarItem={setItemEditando}
                onRemoverItem={removerItem}
                onRemoverComanda={removerComanda}
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

      {itemEditando && (
        <ItemEditModal
          item={itemEditando}
          onClose={() => setItemEditando(null)}
          onSave={salvarItem}
        />
      )}
    </div>
  )
}
