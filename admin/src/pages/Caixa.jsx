import { useState, useEffect, useCallback } from 'react'
import api from '../lib/api'

const fmt = (v) => 'R$ ' + Number(v ?? 0).toFixed(2).replace('.', ',')

const DENOMS = [0.05, 0.10, 0.25, 0.50, 1, 2, 5, 10, 20, 50, 100, 200]

function calcTotalDenoms(denoms) {
  if (!denoms) return 0
  return DENOMS.reduce((acc, d) => acc + d * (denoms[String(d)] || 0), 0)
}

function denomLabel(d) {
  if (d < 1) return `${Math.round(d * 100)}¢`
  return `R$${Number.isInteger(d) ? d : d.toFixed(2)}`
}

function StatusBadge({ status }) {
  const cls = {
    ABERTO:      'bg-emerald-100 text-emerald-700',
    FECHADO:     'bg-blue-100 text-blue-700',
    NAO_FECHADO: 'bg-red-100 text-red-700',
  }[status] || 'bg-gray-100 text-gray-500'
  const label = { ABERTO: 'Aberto', FECHADO: 'Fechado', NAO_FECHADO: 'Não fechado' }[status] || status
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cls}`}>{label}</span>
}

function DenomTable({ denoms, label }) {
  if (!denoms) return null
  const total = calcTotalDenoms(denoms)
  const rows = DENOMS.filter((d) => (denoms[String(d)] || 0) > 0)
  if (rows.length === 0) return null

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
        <span className="font-bold text-gray-800">{fmt(total)}</span>
      </div>
      <div className="grid grid-cols-4 gap-1">
        {rows.map((d) => (
          <div key={d} className="bg-gray-50 rounded-lg px-2 py-1.5 text-center">
            <p className="text-xs text-gray-400">{denomLabel(d)}</p>
            <p className="font-semibold text-gray-700">{denoms[String(d)]}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function tipoMovLabel(tipo) {
  return { SANGRIA: 'Sangria', ALIMENTACAO: 'Alimentação', OUTROS: 'Outros', TROCO: 'Troco' }[tipo] || tipo
}

// Brasilia = UTC-3; hoje com boundary às 5h
function hoje() {
  const now = new Date()
  const brasiliaMs = now.getTime() - 3 * 60 * 60 * 1000
  const brasilia = new Date(brasiliaMs)
  if (brasilia.getUTCHours() < 5) brasilia.setUTCDate(brasilia.getUTCDate() - 1)
  const yyyy = brasilia.getUTCFullYear()
  const mm = String(brasilia.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(brasilia.getUTCDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function inicioSemana() {
  const d = new Date(hoje())
  const day = d.getUTCDay() // 0=Dom, 1=Seg, ..., 6=Sáb
  const daysFromMon = (day + 6) % 7 // 0 para Seg, 6 para Dom
  d.setUTCDate(d.getUTCDate() - daysFromMon)
  return d.toISOString().slice(0, 10)
}

function fimSemana() {
  const d = new Date(inicioSemana())
  d.setUTCDate(d.getUTCDate() + 6)
  return d.toISOString().slice(0, 10)
}

// ─── View Diária ─────────────────────────────────────────────────────────────
function ViewDia() {
  const [data, setData] = useState(hoje())
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro('')
    try {
      const { data: res } = await api.get(`/api/admin/caixa/dia?data=${data}`)
      setResult(res)
    } catch {
      setErro('Erro ao carregar dados do caixa')
    } finally {
      setLoading(false)
    }
  }, [data])

  useEffect(() => { carregar() }, [carregar])

  const c = result?.caixa
  const lucro = result?.lucro ?? null
  const fechamentoEstimado = result?.fechamentoEstimado ?? null
  const totalVendasPDV = result?.totalVendasPDV ?? 0
  const totalVendasDelivery = result?.totalVendasDelivery ?? 0
  const totalVendas = result?.totalVendas ?? 0

  // Para reconciliação do caixa físico: apenas DINHEIRO entra no gaveta.
  // PDV: soma de todos os pagamentos DINHEIRO nas comandas.
  // Delivery: soma dos pedidos com formaPagamento === DINHEIRO.
  const dinheiroPDV = result?.vendas?.reduce((acc, v) => {
    const pags = Array.isArray(v.pagamentos) && v.pagamentos.length > 0
      ? v.pagamentos
      : [{ forma: v.formaPagamento, valor: Number(v.total) }]
    return acc + pags.filter(p => p.forma === 'DINHEIRO').reduce((a, p) => a + Number(p.valor), 0)
  }, 0) || 0

  const dinheiroDelivery = result?.pedidosDelivery?.reduce((acc, p) => {
    return acc + (p.formaPagamento === 'DINHEIRO' ? Number(p.total) : 0)
  }, 0) || 0

  const esperado = c && c.status === 'FECHADO'
    ? (() => {
        const movs = c.movimentacoes || []
        const saidas = movs.filter(m => m.tipo !== 'TROCO').reduce((a, m) => a + Number(m.valor), 0)
        const entradas = movs.filter(m => m.tipo === 'TROCO').reduce((a, m) => a + Number(m.valor), 0)
        return Number(c.totalAbertura) + dinheiroPDV + dinheiroDelivery - saidas + entradas
      })()
    : null

  const inconsistente = esperado !== null && c?.totalFechamento !== null
    && Math.abs(Number(c.totalFechamento) - esperado) > 0.01

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <input
          type="date"
          value={data}
          onChange={(e) => setData(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
        />
        <button
          onClick={carregar}
          className="text-xs text-brand border border-brand/30 px-3 py-2 rounded-lg hover:bg-brand/5"
        >
          ↻ Atualizar
        </button>
      </div>

      {erro && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2.5">{erro}</div>
      )}

      {loading ? (
        <div className="text-center py-8 text-gray-400 text-sm">Carregando…</div>
      ) : !result || !c ? (
        <div className="text-center py-12 text-gray-400">
          <div className="text-4xl mb-2">📭</div>
          <p>Nenhum caixa encontrado para esta data</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Cabeçalho */}
          <div className="bg-white rounded-xl border shadow-sm p-4 flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <h3 className="font-bold text-gray-800">
                  {new Date(data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
                </h3>
                <StatusBadge status={c.status} />
              </div>
              {c.abertoPor && <p className="text-xs text-gray-400">Aberto por {c.abertoPor}</p>}
              {c.fechadoPor && <p className="text-xs text-gray-400">Fechado por {c.fechadoPor}</p>}
              {c.responsavelNaoFechamento && (
                <p className="text-xs text-amber-600">Responsável não fechamento: {c.responsavelNaoFechamento}</p>
              )}
            </div>
            {lucro !== null && (
              <div className="text-right">
                <p className="text-xs text-gray-400">
                  {fechamentoEstimado != null ? 'Lucro estimado' : 'Lucro do dia'}
                </p>
                <p className={`text-2xl font-bold ${lucro >= 0 ? (fechamentoEstimado != null ? 'text-amber-600' : 'text-emerald-600') : 'text-red-600'}`}>
                  {fmt(lucro)}
                  {fechamentoEstimado != null && <span className="text-sm font-normal ml-1 text-amber-400">est.</span>}
                </p>
              </div>
            )}
          </div>



          <div className="grid md:grid-cols-2 gap-4">
            {/* Abertura */}
            <div className="bg-white rounded-xl border shadow-sm p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-gray-700">Abertura</h4>
                <span className="font-bold text-gray-800">{fmt(c.totalAbertura)}</span>
              </div>
              <DenomTable denoms={c.denominacoesAbertura} label="Cédulas / Moedas" />
              <p className="text-xs text-gray-400">
                {new Date(c.criadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}
              </p>
            </div>

            {/* Fechamento */}
            {c.status === 'FECHADO' ? (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-gray-700">Fechamento</h4>
                  <span className="font-bold text-gray-800">{fmt(c.totalFechamento)}</span>
                </div>
                <DenomTable denoms={c.denominacoesFechamento} label="Cédulas / Moedas" />
                {/* Sobrou / Faltou */}
                {esperado !== null && (() => {
                  const dif = Number(c.totalFechamento) - esperado
                  const abs = Math.abs(dif)
                  if (abs < 0.01) {
                    return (
                      <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                        <span className="text-emerald-600 text-sm font-semibold">✓ Fechamento exato</span>
                      </div>
                    )
                  }
                  if (dif > 0) {
                    return (
                      <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                        <span className="text-emerald-700 text-sm font-medium">Sobrou</span>
                        <span className="text-emerald-700 font-bold text-base">{fmt(abs)}</span>
                      </div>
                    )
                  }
                  return (
                    <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                      <span className="text-red-700 text-sm font-medium">Faltou</span>
                      <span className="text-red-700 font-bold text-base">{fmt(abs)}</span>
                    </div>
                  )
                })()}
                {c.fechadoEm && (
                  <p className="text-xs text-gray-400">
                    {new Date(c.fechadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}
                  </p>
                )}
              </div>
            ) : fechamentoEstimado != null ? (
              /* Caixa não fechado, mas abertura do dia seguinte disponível como estimativa */
              <div className="bg-amber-50 rounded-xl border border-amber-200 shadow-sm p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold text-amber-700">Estimativa de fechamento</h4>
                    <p className="text-xs text-amber-500 mt-0.5">Abertura do dia seguinte como referência</p>
                  </div>
                  <span className="font-bold text-amber-700 text-lg">{fmt(fechamentoEstimado)}</span>
                </div>
              </div>
            ) : (
              <div className="bg-gray-50 rounded-xl border border-gray-100 shadow-sm p-4 flex items-center justify-center text-gray-400 text-sm">
                Caixa ainda não fechado
              </div>
            )}
          </div>

          {/* Vendas do dia */}
          <div className="bg-white rounded-xl border shadow-sm p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-gray-700">Vendas do dia</h4>
              <span className="font-bold text-emerald-700 text-lg">{fmt(totalVendas)}</span>
            </div>

            {/* PDV */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">🏪 Balcão (PDV)</span>
                <span className="text-sm font-bold text-gray-700">{fmt(totalVendasPDV)}</span>
              </div>
              <p className="text-xs text-gray-400 mb-1">{result.vendas?.length || 0} comanda(s) finalizada(s)</p>
              {(() => {
                const totais = {}
                const labelMap = { DINHEIRO: '💵 Dinheiro', MAQUINA: '💳 Cartão', PIX: '📱 Pix', NOTINHA: '📝 Notinha' }
                for (const venda of result.vendas || []) {
                  const pags = Array.isArray(venda.pagamentos) && venda.pagamentos.length > 0
                    ? venda.pagamentos
                    : [{ forma: venda.formaPagamento, valor: Number(venda.total) }]
                  for (const pg of pags) {
                    if (!pg.forma) continue
                    totais[pg.forma] = (totais[pg.forma] || 0) + Number(pg.valor)
                  }
                }
                const entries = Object.entries(totais)
                if (entries.length === 0) return null
                return (
                  <div className="space-y-1">
                    {entries.map(([forma, val]) => (
                      <div key={forma} className="flex items-center justify-between text-sm">
                        <span className="text-gray-400">{labelMap[forma] ?? forma}</span>
                        <span className="font-semibold text-gray-600">{fmt(val)}</span>
                      </div>
                    ))}
                  </div>
                )
              })()}
            </div>

            {/* Delivery */}
            {result.pedidosDelivery && result.pedidosDelivery.length > 0 && (
              <div className="pt-2 border-t border-gray-100">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">🛵 Delivery</span>
                  <span className="text-sm font-bold text-gray-700">{fmt(totalVendasDelivery)}</span>
                </div>
                <p className="text-xs text-gray-400 mb-1">{result.pedidosDelivery.length} pedido(s)</p>
                {(() => {
                  const totais = {}
                  const labelMap = { DINHEIRO: '💵 Dinheiro', MAQUINA: '💳 Cartão', PIX: '📱 Pix', NOTINHA: '📝 Notinha' }
                  for (const p of result.pedidosDelivery) {
                    if (!p.formaPagamento) continue
                    totais[p.formaPagamento] = (totais[p.formaPagamento] || 0) + Number(p.total)
                  }
                  return Object.entries(totais).map(([forma, val]) => (
                    <div key={forma} className="flex items-center justify-between text-sm">
                      <span className="text-gray-400">{labelMap[forma] ?? forma}</span>
                      <span className="font-semibold text-gray-600">{fmt(val)}</span>
                    </div>
                  ))
                })()}
              </div>
            )}
          </div>

          {/* Movimentações */}
          {c.movimentacoes?.length > 0 && (
            <div className="bg-white rounded-xl border shadow-sm p-4">
              <h4 className="font-semibold text-gray-700 mb-3">Movimentações</h4>
              <div className="space-y-2">
                {c.movimentacoes.map((m) => (
                  <div key={m.id} className="flex items-center justify-between text-sm">
                    <div>
                      <span className="text-xs bg-gray-100 text-gray-500 rounded px-1.5 py-0.5 mr-2">
                        {tipoMovLabel(m.tipo)}
                      </span>
                      <span className="text-gray-700">{m.nome}</span>
                    </div>
                    <span className={`font-semibold ${m.tipo === 'TROCO' ? 'text-emerald-600' : 'text-red-500'}`}>
                      {m.tipo === 'TROCO' ? '+' : '-'}{fmt(m.valor)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── View Semanal ─────────────────────────────────────────────────────────────
function ViewSemanal() {
  const [inicio, setInicio] = useState(inicioSemana())
  const [fim, setFim] = useState(fimSemana())
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro('')
    try {
      const { data } = await api.get(`/api/admin/caixa/periodo?inicio=${inicio}&fim=${fim}`)
      setRows(data)
    } catch {
      setErro('Erro ao carregar período')
    } finally {
      setLoading(false)
    }
  }, [inicio, fim])

  useEffect(() => { carregar() }, [carregar])

  const totalLucro = rows.reduce((acc, r) => acc + (r.lucro ?? 0), 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">De</label>
          <input
            type="date"
            value={inicio}
            onChange={(e) => setInicio(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">até</label>
          <input
            type="date"
            value={fim}
            onChange={(e) => setFim(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <button
          onClick={carregar}
          className="text-xs text-brand border border-brand/30 px-3 py-2 rounded-lg hover:bg-brand/5"
        >
          ↻ Atualizar
        </button>
      </div>

      {erro && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2.5">{erro}</div>
      )}

      {loading ? (
        <div className="text-center py-8 text-gray-400 text-sm">Carregando…</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-gray-400">Nenhum caixa no período</div>
      ) : (
        <>
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Data</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-gray-600">Abertura</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-gray-600">Fechamento</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-gray-600">Status</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-gray-600">Lucro</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-700">
                      {new Date(r.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">{fmt(r.totalAbertura)}</td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {r.totalFechamento != null
                        ? fmt(r.totalFechamento)
                        : r.fechamentoEstimado != null
                          ? <span className="text-amber-600">{fmt(r.fechamentoEstimado)} <span className="text-xs font-normal text-amber-400">est.</span></span>
                          : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className={`px-4 py-3 text-right font-bold ${
                      r.lucro == null
                        ? 'text-gray-400'
                        : r.lucro >= 0
                          ? r.fechamentoEstimado != null ? 'text-amber-600' : 'text-emerald-600'
                          : 'text-red-600'
                    }`}>
                      {r.lucro != null
                        ? <>{fmt(r.lucro)}{r.fechamentoEstimado != null && <span className="text-xs font-normal ml-1 text-amber-400">est.</span>}</>
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-white rounded-xl border shadow-sm p-4 flex items-center justify-between">
            <span className="font-semibold text-gray-700">Lucro total do período</span>
            <span className={`text-2xl font-bold ${totalLucro >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {fmt(totalLucro)}
            </span>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function Caixa() {
  const [view, setView] = useState('dia')

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Caixa</h1>
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          <button
            onClick={() => setView('dia')}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              view === 'dia' ? 'bg-white text-brand shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Dia
          </button>
          <button
            onClick={() => setView('semanal')}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              view === 'semanal' ? 'bg-white text-brand shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Semanal
          </button>
        </div>
      </div>

      {view === 'dia' ? <ViewDia /> : <ViewSemanal />}
    </div>
  )
}
