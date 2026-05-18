import { useState, useEffect, useCallback, useRef } from 'react'
import api from '../lib/api'
import Modal from '../components/Modal'

function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    ;[0, 0.18].forEach((delay) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = 880
      osc.type = 'sine'
      gain.gain.setValueAtTime(0.4, ctx.currentTime + delay)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.4)
      osc.start(ctx.currentTime + delay)
      osc.stop(ctx.currentTime + delay + 0.4)
    })
  } catch {}
}

function showOrderNotification(pedido) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  new Notification(`🍦 Novo pedido #${pedido.numeroDia}`, {
    body: `${pedido.clienteNome || 'Cliente'} · R$ ${Number(pedido.total).toFixed(2).replace('.', ',')}`,
    icon: '/favicon.ico',
  })
}

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
      const obsHTML = isKilo && item.observacao
        ? `<div style="font-size:11px;padding-left:4px;color:#444">↳ ${item.observacao}</div>`
        : ''
      return `<div class="row"><span>${label}</span><span>${fmt(item.totalItem)}</span></div>${obsHTML}`
    })
    .join('')

  const enderecoHTML =
    pedido.tipoEntrega === 'ENTREGA'
      ? `<div class="sec bold">ENTREGA:</div>
         <div class="bold">${pedido.rua}, ${pedido.numero}</div>
         <div class="bold">Bairro: ${pedido.bairro}</div>
         ${pedido.referencia ? `<div class="bold">Ref: ${pedido.referencia}</div>` : ''}`
      : `<div class="center bold">★ RETIRADA NA LOJA ★</div>`

  const pagLabel = { DINHEIRO: 'Dinheiro', MAQUINA: 'Cartão/QR', PIX: 'Pix' }

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Courier New',Courier,monospace;font-size:13px;font-weight:bold;width:48mm;padding:3mm 2mm 3mm 1mm;margin:0}
@page{size:58mm auto;margin:0}
.center{text-align:center}.bold{font-weight:bold}
.div{border-top:1px dashed #000;margin:4px 0}
.row{display:flex;justify-content:space-between;gap:4px}
.row span:first-child{flex:1}
.sec{margin-top:4px}
</style></head><body>
<div class="center bold" style="font-size:15px">SORVETERIA DUBON</div>
<div class="center bold">Pedido #${pedido.numeroDia}</div>
<div class="center">${dt}</div>
<div class="div"></div>
${itensHTML}
<div class="div"></div>
${Number(pedido.taxaEntrega) > 0 ? `<div class="row"><span>Taxa entrega</span><span>${fmt(pedido.taxaEntrega)}</span></div>` : ''}
<div class="row bold"><span>TOTAL</span><span>${fmt(pedido.total)}</span></div>
<div class="div"></div>
${enderecoHTML}
<div class="div"></div>
<div class="bold">Pagamento: ${pagLabel[pedido.formaPagamento] || pedido.formaPagamento}</div>
${pedido.trocoPara ? `<div>Troco para: ${fmt(pedido.trocoPara)}</div>` : ''}
${pedido.pago ? `<div class="div"></div><div class="center bold" style="font-size:15px">✔ PAGO</div>` : ''}
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
      const label = isKilo
        ? `${i.quantidade * 100}g × ${i.produto.nome}`
        : `${i.quantidade} × ${i.produto.nome}`
      return i.observacao ? `${label} (${i.observacao})` : label
    })
    .join(' · ')
}

export default function Pedidos() {
  const [pedidos, setPedidos] = useState([])
  const [date, setDate] = useState(today())
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [printModal, setPrintModal] = useState(null)
  const [editModal, setEditModal] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [editItens, setEditItens] = useState([])
  const [editSaving, setEditSaving] = useState(false)
  const [produtos, setProdutos] = useState([])
  const [newItem, setNewItem] = useState({ produtoId: '', qtd: 1, preco: '' })
  const prevOrderIds = useRef(null)  // null = primeira carga (sem notificação)

  const fetchPedidos = useCallback(async () => {
    try {
      const params = { data: date }
      if (statusFilter) params.status = statusFilter
      const { data } = await api.get('/api/admin/pedidos', { params })
      setPedidos(data)

      // Detecta pedidos novos (ignora primeira carga)
      if (prevOrderIds.current !== null) {
        const novos = data.filter((p) => !prevOrderIds.current.has(p.id))
        if (novos.length > 0) {
          playNotificationSound()
          novos.forEach((p) => showOrderNotification(p))
        }
      }
      prevOrderIds.current = new Set(data.map((p) => p.id))
    } catch {
      // silencia erros de polling
    } finally {
      setLoading(false)
    }
  }, [date, statusFilter])

  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

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

  const openEdit = (p) => {
    setEditForm({
      clienteNome:     p.clienteNome     || '',
      whatsappCliente: p.whatsappCliente || '',
      tipoEntrega:     p.tipoEntrega,
      rua:             p.rua             || '',
      numero:          p.numero          || '',
      bairro:          p.bairro          || '',
      referencia:      p.referencia      || '',
      formaPagamento:  p.formaPagamento,
      trocoPara:       p.trocoPara != null ? String(p.trocoPara) : '',
      taxaEntrega:     String(p.taxaEntrega),
    })
    setEditItens(p.itens.map((i) => ({
      produtoId:     i.produtoId,
      nome:          i.produto.nome,
      tipo:          i.produto.categoria?.tipo,
      quantidade:    i.quantidade,
      precoUnitario: Number(i.precoUnitario),
      observacao:    i.observacao || '',
    })))
    setNewItem({ produtoId: '', qtd: 1, preco: '' })
    if (produtos.length === 0) {
      api.get('/api/admin/produtos').then(({ data }) => setProdutos(data)).catch(() => {})
    }
    setEditModal(p)
  }

  const addEditItem = () => {
    const prod = produtos.find((p) => p.id === parseInt(newItem.produtoId))
    if (!prod) return
    setEditItens((prev) => [...prev, {
      produtoId:     prod.id,
      nome:          prod.nome,
      tipo:          prod.categoria?.tipo,
      quantidade:    Math.max(1, parseInt(newItem.qtd) || 1),
      precoUnitario: parseFloat(newItem.preco) || 0,
      observacao:    '',
    }])
    setNewItem({ produtoId: '', qtd: 1, preco: '' })
  }

  const calcPrecoDefault = (prod) => {
    if (!prod) return ''
    const isKilo = prod.categoria?.tipo === 'KILO'
    const v = isKilo ? Number(prod.categoria?.precoKilo || 0) / 10 : Number(prod.preco || 0)
    return v > 0 ? String(v) : ''
  }

  const removeEditItem = (idx) =>
    setEditItens((prev) => prev.filter((_, i) => i !== idx))

  const changeEditItemQtd = (idx, val) => {
    const qtd = Math.max(1, parseInt(val) || 1)
    setEditItens((prev) => prev.map((item, i) => i === idx ? { ...item, quantidade: qtd } : item))
  }

  const changeEditItemObs = (idx, val) =>
    setEditItens((prev) => prev.map((item, i) => i === idx ? { ...item, observacao: val.slice(0, 300) } : item))

  const handleEdit = async () => {
    if (!editModal) return
    if (editItens.length === 0) { alert('O pedido deve ter ao menos 1 item'); return }
    setEditSaving(true)
    try {
      // 1. Salva dados do pedido (incluindo taxaEntrega)
      await api.patch(`/api/admin/pedidos/${editModal.id}`, {
        clienteNome:     editForm.clienteNome     || undefined,
        whatsappCliente: editForm.whatsappCliente || null,
        tipoEntrega:     editForm.tipoEntrega,
        rua:             editForm.rua             || null,
        numero:          editForm.numero          || null,
        bairro:          editForm.bairro          || null,
        referencia:      editForm.referencia      || null,
        formaPagamento:  editForm.formaPagamento,
        trocoPara:       editForm.trocoPara !== '' ? parseFloat(editForm.trocoPara) : null,
        taxaEntrega:     parseFloat(editForm.taxaEntrega),
      })
      // 2. Salva itens e recalcula subtotal/total com a nova taxaEntrega
      const { data } = await api.put(`/api/admin/pedidos/${editModal.id}/itens`, {
        itens: editItens.map((i) => ({
          produtoId:     i.produtoId,
          quantidade:    i.quantidade,
          precoUnitario: i.precoUnitario,
          observacao:    i.observacao || null,
        })),
      })
      setPedidos((prev) => prev.map((p) => (p.id === data.id ? data : p)))
      setEditModal(null)
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao salvar pedido')
    } finally {
      setEditSaving(false)
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
              onEdit={() => openEdit(p)}
            />
          ))}
        </div>
      )}

      {/* ── Modal de edição ── */}
      {editModal && (
        <Modal
          title={`Editar Pedido #${editModal.numeroDia}`}
          onClose={() => setEditModal(null)}
          size="lg"
          footer={
            <>
              <button
                onClick={() => setEditModal(null)}
                className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleEdit}
                disabled={editSaving}
                className="px-4 py-2 text-sm rounded-lg bg-brand text-white hover:bg-brand-light disabled:opacity-50"
              >
                {editSaving ? 'Salvando…' : 'Salvar'}
              </button>
            </>
          }
        >
          <div className="space-y-3">
            {/* Nome e WhatsApp */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nome do cliente</label>
                <input
                  type="text"
                  value={editForm.clienteNome}
                  onChange={(e) => setEditForm((f) => ({ ...f, clienteNome: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">WhatsApp</label>
                <input
                  type="text"
                  value={editForm.whatsappCliente}
                  onChange={(e) => setEditForm((f) => ({ ...f, whatsappCliente: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>
            </div>

            {/* Tipo de entrega */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de entrega</label>
              <select
                value={editForm.tipoEntrega}
                onChange={(e) => setEditForm((f) => ({ ...f, tipoEntrega: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              >
                <option value="ENTREGA">🛵 Entrega</option>
                <option value="RETIRADA">🏪 Retirada</option>
              </select>
            </div>

            {/* Endereço (só se ENTREGA) */}
            {editForm.tipoEntrega === 'ENTREGA' && (
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Rua</label>
                  <input
                    type="text"
                    value={editForm.rua}
                    onChange={(e) => setEditForm((f) => ({ ...f, rua: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Número</label>
                  <input
                    type="text"
                    value={editForm.numero}
                    onChange={(e) => setEditForm((f) => ({ ...f, numero: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Bairro</label>
                  <input
                    type="text"
                    value={editForm.bairro}
                    onChange={(e) => setEditForm((f) => ({ ...f, bairro: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Referência</label>
                  <input
                    type="text"
                    value={editForm.referencia}
                    onChange={(e) => setEditForm((f) => ({ ...f, referencia: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                  />
                </div>
              </div>
            )}

            {/* Itens do pedido */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-2">Itens do pedido</label>
              <div className="space-y-1.5 mb-2">
                {editItens.map((item, idx) => (
                  <div key={idx} className="bg-gray-50 rounded-lg px-3 py-2 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="flex-1 text-sm text-gray-700 truncate">
                        {item.tipo === 'KILO' ? `${item.quantidade * 100}g` : `${item.quantidade}×`} {item.nome}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => changeEditItemQtd(idx, item.quantidade - 1)}
                          disabled={item.quantidade <= 1}
                          className="w-6 h-6 rounded bg-gray-200 text-gray-700 hover:bg-gray-300 text-sm font-bold disabled:opacity-40 leading-none"
                        >−</button>
                        <span className="w-6 text-center text-sm font-medium">{item.quantidade}</span>
                        <button
                          type="button"
                          onClick={() => changeEditItemQtd(idx, item.quantidade + 1)}
                          className="w-6 h-6 rounded bg-gray-200 text-gray-700 hover:bg-gray-300 text-sm font-bold leading-none"
                        >+</button>
                      </div>
                      <span className="text-sm font-medium text-gray-700 w-20 text-right shrink-0">
                        {fmt(item.quantidade * item.precoUnitario)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeEditItem(idx)}
                        className="text-red-400 hover:text-red-600 text-xl leading-none shrink-0"
                      >×</button>
                    </div>
                    {item.tipo === 'KILO' && (
                      <input
                        type="text"
                        maxLength={300}
                        value={item.observacao}
                        onChange={(e) => changeEditItemObs(idx, e.target.value)}
                        placeholder="Observação (opcional)"
                        className="w-full border border-gray-200 rounded px-2 py-1 text-xs text-gray-600 focus:outline-none focus:ring-1 focus:ring-brand bg-white"
                      />
                    )}
                  </div>
                ))}
                {editItens.length === 0 && (
                  <p className="text-xs text-red-500 px-1">Nenhum item — adicione ao menos 1 produto.</p>
                )}
              </div>

              {/* Adicionar produto */}
              <div className="flex gap-2 flex-wrap">
                <select
                  value={newItem.produtoId}
                  onChange={(e) => {
                    const prod = produtos.find((p) => p.id === parseInt(e.target.value))
                    setNewItem((f) => ({ ...f, produtoId: e.target.value, preco: calcPrecoDefault(prod) }))
                  }}
                  className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                >
                  <option value="">Selecionar produto…</option>
                  {produtos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.categoria?.nome ? `${p.categoria.nome} — ` : ''}{p.nome}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min="1"
                  value={newItem.qtd}
                  onChange={(e) => setNewItem((f) => ({ ...f, qtd: e.target.value }))}
                  className="w-14 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-brand"
                  placeholder="Qtd"
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={newItem.preco}
                  onChange={(e) => setNewItem((f) => ({ ...f, preco: e.target.value }))}
                  className="w-24 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-brand"
                  placeholder="R$ preço"
                />
                <button
                  type="button"
                  onClick={addEditItem}
                  disabled={!newItem.produtoId}
                  className="px-3 py-1.5 text-sm rounded-lg bg-brand text-white hover:bg-brand-light disabled:opacity-40 shrink-0"
                >
                  + Adicionar
                </button>
              </div>

              {editItens.length > 0 && (
                <div className="flex justify-end mt-2 text-sm text-gray-500">
                  Subtotal: <strong className="ml-1 text-gray-700">
                    {fmt(editItens.reduce((s, i) => s + i.quantidade * i.precoUnitario, 0))}
                  </strong>
                </div>
              )}
            </div>

            {/* Pagamento */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Pagamento</label>
                <select
                  value={editForm.formaPagamento}
                  onChange={(e) => setEditForm((f) => ({ ...f, formaPagamento: e.target.value, trocoPara: '' }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                >
                  <option value="PIX">📱 Pix</option>
                  <option value="MAQUINA">💳 Cartão/QR</option>
                  <option value="DINHEIRO">💵 Dinheiro</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Taxa entrega (R$)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editForm.taxaEntrega}
                  onChange={(e) => setEditForm((f) => ({ ...f, taxaEntrega: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>
              {editForm.formaPagamento === 'DINHEIRO' && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Troco para (R$)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editForm.trocoPara}
                    onChange={(e) => setEditForm((f) => ({ ...f, trocoPara: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                  />
                </div>
              )}
            </div>
          </div>
        </Modal>
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
function PedidoCard({ pedido: p, onFlag, onStatus, onMsg, onPrint, onEdit }) {
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
          onClick={onEdit}
          className="text-xs px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium"
        >
          ✏️ Editar
        </button>
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
    if (isKilo && item.observacao) lines.push(`  Obs: ${item.observacao}`)
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
