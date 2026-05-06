import { useState, useEffect, useCallback } from 'react'
import api from '../lib/api'
import Modal from '../components/Modal'

const fmt = (v) => 'R$ ' + Number(v).toFixed(2).replace('.', ',')

const STATUS = {
  RECEBIDO:   { label: 'Recebido',   cls: 'bg-yellow-100 text-yellow-800' },
  EM_PREPARO: { label: 'Em preparo', cls: 'bg-blue-100 text-blue-800' },
  SAIU:       { label: 'Saiu',       cls: 'bg-purple-100 text-purple-800' },
  FINALIZADO: { label: 'Finalizado', cls: 'bg-green-100 text-green-800' },
  CANCELADO:  { label: 'Cancelado',  cls: 'bg-red-100 text-red-800' },
}

const PAG = { DINHEIRO: '💵 Dinheiro', MAQUINA: '💳 Cartão/QR', PIX: '📱 Pix' }

function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}

function gerarReciboHTML(pedido) {
  const dt = new Date(pedido.criadoEm).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  const itensHTML = pedido.itens
    .map((item) => {
      const isKilo = item.produto.categoria?.tipo === 'KILO'
      const label = isKilo
        ? `${item.quantidade * 100}g × ${item.produto.nome}`
        : `${item.quantidade} × ${item.produto.nome}`
      return `<div class="row"><span>${label}</span><span>${fmt(item.totalItem)}</span></div>`
    })
    .join('')

  const enderecoHTML =
    pedido.tipoEntrega === 'ENTREGA'
      ? `<div class="sec bold">ENTREGA:</div>
         <div>${pedido.rua}, ${pedido.numero}</div>
         <div>Bairro: ${pedido.bairro}</div>
         ${pedido.referencia ? `<div>Ref: ${pedido.referencia}</div>` : ''}`
      : `<div class="center bold">★ RETIRADA NA LOJA ★</div>`

  const pagLabel = { DINHEIRO: 'Dinheiro', MAQUINA: 'Cartão/QR', PIX: 'Pix' }

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Courier New',Courier,monospace;font-size:11px;width:52mm;padding:3mm}
@page{size:58mm auto;margin:0}
.center{text-align:center}.bold{font-weight:bold}
.div{border-top:1px dashed #000;margin:4px 0}
.row{display:flex;justify-content:space-between;gap:4px}
.row span:first-child{flex:1}
.sec{margin-top:4px}
</style></head><body>
<div class="center bold" style="font-size:13px">SORVETERIA DUBON</div>
<div class="center">Pedido #${pedido.numeroDia}</div>
<div class="center">${dt}</div>
<div class="div"></div>
${itensHTML}
<div class="div"></div>
${Number(pedido.taxaEntrega) > 0 ? `<div class="row"><span>Taxa entrega</span><span>${fmt(pedido.taxaEntrega)}</span></div>` : ''}
<div class="row bold"><span>TOTAL</span><span>${fmt(pedido.total)}</span></div>
<div class="div"></div>
${enderecoHTML}
<div class="div"></div>
<div>Pagamento: ${pagLabel[pedido.formaPagamento] || pedido.formaPagamento}</div>
${pedido.trocoPara ? `<div>Troco para: ${fmt(pedido.trocoPara)}</div>` : ''}
${pedido.pago ? `<div class="div"></div><div class="center bold" style="font-size:13px">✔ PAGO</div>` : ''}
</body></html>`
}

function imprimirPedido(pedido) {
  const win = window.open('', '_blank', 'width=420,height=700,menubar=no,toolbar=no')
  if (!win) { alert('Permita popups para imprimir.'); return }
  win.document.write(gerarReciboHTML(pedido))
  win.document.close()
  win.focus()
  setTimeout(() => { win.print() }, 400)
}

function resumoItens(itens) {
  return itens
    .map((i) => {
      const isKilo = i.produto.categoria?.tipo === 'KILO'
      return isKilo
        ? `${i.quantidade * 100}g × ${i.produto.nome}`
        : `${i.quantidade} × ${i.produto.nome}`
    })
    .join(' · ')
}

export default function Pedidos() {
  const [pedidos, setPedidos] = useState([])
  const [date, setDate] = useState(today())
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [printModal, setPrintModal] = useState(null)

  const fetchPedidos = useCallback(async () => {
    try {
      const params = { data: date }
      if (statusFilter) params.status = statusFilter
      const { data } = await api.get('/api/admin/pedidos', { params })
      setPedidos(data)
    } catch {
      // silencia erros de polling
    } finally {
      setLoading(false)
    }
  }, [date, statusFilter])

  useEffect(() => {
    setLoading(true)
    fetchPedidos()
    const t = setInterval(fetchPedidos, 30000)
    return () => clearInterval(t)
  }, [fetchPedidos])

  const handleFlag = async (id, key, val) => {
    setPedidos((prev) => prev.map((p) => (p.id === id ? { ...p, [key]: val } : p)))
    try {
      await api.patch(`/api/admin/pedidos/${id}/flags`, { [key]: val })
    } catch {
      setPedidos((prev) => prev.map((p) => (p.id === id ? { ...p, [key]: !val } : p)))
    }
  }

  const handleStatus = async (id, status) => {
    const anterior = pedidos.find((p) => p.id === id)?.status
    setPedidos((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)))
    try {
      await api.patch(`/api/admin/pedidos/${id}/status`, { status })
    } catch {
      setPedidos((prev) => prev.map((p) => (p.id === id ? { ...p, status: anterior } : p)))
    }
  }

  const handleMsg = async (id, tipo) => {
    try {
      const { data } = await api.post(`/api/admin/pedidos/${id}/msg-${tipo}`)
      window.open(data.link, '_blank')
      if (tipo === 'cliente') {
        setPedidos((prev) => prev.map((p) => (p.id === id ? { ...p, whatsappEnviado: true } : p)))
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao gerar link')
    }
  }

  const pedidosAtivos = pedidos.filter((p) => p.status !== 'CANCELADO')
  const receita = pedidosAtivos.reduce((s, p) => s + Number(p.total), 0)

  return (
    <div>
      {/* ── Cabeçalho ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-bold text-brand">Pedidos</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {pedidosAtivos.length} pedidos · {fmt(receita)} de receita
          </p>
        </div>
        <button
          onClick={fetchPedidos}
          className="text-sm text-brand-light hover:underline self-start sm:self-auto"
        >
          ↻ Atualizar
        </button>
      </div>

      {/* ── Filtros ── */}
      <div className="flex flex-wrap gap-2 mb-5">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
        >
          <option value="">Todos os status</option>
          {Object.entries(STATUS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </div>

      {/* ── Lista ── */}
      {loading ? (
        <div className="text-center py-16 text-gray-400">Carregando…</div>
      ) : pedidos.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-4xl mb-2">📭</div>
          <p>Nenhum pedido encontrado</p>
        </div>
      ) : (
        <div className="space-y-4">
          {pedidos.map((p) => (
            <PedidoCard
              key={p.id}
              pedido={p}
              onFlag={handleFlag}
              onStatus={handleStatus}
              onMsg={handleMsg}
              onPrint={() => setPrintModal(p)}
            />
          ))}
        </div>
      )}

      {/* ── Modal de impressão ── */}
      {printModal && (
        <Modal
          title={`Recibo — Pedido #${printModal.numeroDia}`}
          onClose={() => setPrintModal(null)}
          size="sm"
          footer={
            <>
              <button
                onClick={() => setPrintModal(null)}
                className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50"
              >
                Fechar
              </button>
              <button
                onClick={() => {
                  imprimirPedido(printModal)
                  handleFlag(printModal.id, 'impresso', true)
                  setPrintModal(null)
                }}
                className="px-4 py-2 text-sm rounded-lg bg-brand text-white hover:bg-brand-light"
              >
                🖨️ Imprimir agora
              </button>
            </>
          }
        >
          <pre className="text-xs font-mono bg-gray-50 border border-gray-200 rounded-lg p-3 whitespace-pre-wrap leading-relaxed">
            {gerarReciboTexto(printModal)}
          </pre>
        </Modal>
      )}
    </div>
  )
}

/* ── Card de pedido ── */
function PedidoCard({ pedido: p, onFlag, onStatus, onMsg, onPrint }) {
  const statusInfo = STATUS[p.status] || STATUS.RECEBIDO
  const isEntrega = p.tipoEntrega === 'ENTREGA'

  const cardBg = p.finalizado
    ? 'bg-red-200 border-red-400'
    : p.saiuEntrega
      ? 'bg-green-200 border-green-400'
      : 'bg-white border-gray-200'

  return (
    <div className={`${cardBg} rounded-xl border shadow-sm overflow-hidden transition-colors`}>
      {/* Header */}
      <div className="flex items-start justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-brand text-lg">#{p.numeroDia}</span>
          <span className="text-gray-700 font-medium">{p.clienteNome || '—'}</span>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusInfo.cls}`}>
            {statusInfo.label}
          </span>
          <span className="text-xs text-gray-400">
            {new Date(p.criadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="font-bold text-brand">{fmt(p.total)}</span>
        </div>
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-2">
        {/* Tipo + pagamento */}
        <div className="flex gap-3 text-sm flex-wrap">
          <span className={`font-medium ${isEntrega ? 'text-purple-700' : 'text-green-700'}`}>
            {isEntrega ? '🛵 Entrega' : '🏪 Retirada'}
          </span>
          <span className="text-gray-500">{PAG[p.formaPagamento] || p.formaPagamento}</span>
          {p.trocoPara && (
            <span className="text-gray-500">Troco p/ {fmt(p.trocoPara)}</span>
          )}
        </div>

        {/* Itens */}
        <p className="text-sm text-gray-600">{resumoItens(p.itens)}</p>

        {/* Endereço */}
        {isEntrega && p.rua && (
          <p className="text-sm text-gray-500">
            📍 {p.rua}, {p.numero} — {p.bairro}
            {p.referencia && ` · ${p.referencia}`}
          </p>
        )}
      </div>

      {/* Checkboxes */}
      <div className="flex flex-wrap gap-x-4 gap-y-2 px-4 py-2 border-t border-gray-100 bg-gray-50">
        {[
          { key: 'pago',        label: 'Pago' },
          { key: 'avisado',     label: 'Avisado' },
          { key: 'impresso',    label: 'Impresso' },
          { key: 'saiuEntrega', label: 'Saiu' },
          { key: 'finalizado',  label: 'Finalizado' },
        ].map(({ key, label }) => (
          <label key={key} className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={!!p[key]}
              onChange={(e) => onFlag(p.id, key, e.target.checked)}
              className="w-4 h-4 accent-brand rounded"
            />
            {label}
          </label>
        ))}

        {/* Status dropdown */}
        <select
          value={p.status}
          onChange={(e) => onStatus(p.id, e.target.value)}
          className="ml-auto text-xs border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-brand"
        >
          {Object.entries(STATUS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </div>

      {/* Ações */}
      <div className="flex flex-wrap gap-2 px-4 py-3 border-t border-gray-100">
        <button
          onClick={onPrint}
          className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 font-medium"
        >
          🖨️ Imprimir
        </button>
        {isEntrega && p.whatsappCliente && (
          <button
            onClick={() => onMsg(p.id, 'cliente')}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium ${
              p.whatsappEnviado
                ? 'bg-green-100 text-green-700'
                : 'bg-green-50 text-green-700 hover:bg-green-100'
            }`}
          >
            📱 Avisar cliente{p.whatsappEnviado ? ' ✓' : ''}
          </button>
        )}
        {isEntrega && (
          <button
            onClick={() => onMsg(p.id, 'entregador')}
            className="text-xs px-3 py-1.5 rounded-lg bg-purple-50 text-purple-700 hover:bg-purple-100 font-medium"
          >
            🛵 Avisar entregador
          </button>
        )}
      </div>
    </div>
  )
}

/* Texto pré-formatado do recibo (exibido no modal antes de imprimir) */
function gerarReciboTexto(p) {
  const W = 32
  const line = '='.repeat(W)
  const dash = '-'.repeat(W)
  const center = (s) => {
    const pad = Math.max(0, Math.floor((W - s.length) / 2))
    return ' '.repeat(pad) + s
  }
  const rowLR = (l, r) => {
    const space = Math.max(1, W - l.length - r.length)
    return l + ' '.repeat(space) + r
  }

  const dt = new Date(p.criadoEm).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  const lines = [
    line,
    center('SORVETERIA DUBON'),
    center(`Pedido #${p.numeroDia}`),
    center(dt),
    line,
  ]

  p.itens.forEach((item) => {
    const isKilo = item.produto.categoria?.tipo === 'KILO'
    const qty = isKilo ? `${item.quantidade * 100}g` : `${item.quantidade}x`
    const nome = item.produto.nome.substring(0, W - qty.length - fmt(item.totalItem).length - 3)
    const val = fmt(item.totalItem)
    const label = `${qty} ${nome}`
    const space = Math.max(1, W - label.length - val.length)
    lines.push(`${label}${' '.repeat(space)}${val}`)
  })

  lines.push(dash)
  if (Number(p.taxaEntrega) > 0) lines.push(rowLR('Taxa entrega:', fmt(p.taxaEntrega)))
  lines.push(rowLR('TOTAL:', fmt(p.total)))
  lines.push(line)

  if (p.tipoEntrega === 'ENTREGA') {
    lines.push('ENTREGA:')
    lines.push(`${p.rua}, ${p.numero}`)
    lines.push(`Bairro: ${p.bairro}`)
    if (p.referencia) lines.push(`Ref: ${p.referencia}`)
  } else {
    lines.push(center('*** RETIRADA NA LOJA ***'))
  }

  lines.push(dash)
  const pagLabel = { DINHEIRO: 'Dinheiro', MAQUINA: 'Cartão/QR', PIX: 'Pix' }
  lines.push(`Pagamento: ${pagLabel[p.formaPagamento] || p.formaPagamento}`)
  if (p.trocoPara) lines.push(`Troco para: ${fmt(p.trocoPara)}`)
  if (p.pago) { lines.push(line); lines.push(center('✔ PAGO')) }
  lines.push(line)

  return lines.join('\n')
}
