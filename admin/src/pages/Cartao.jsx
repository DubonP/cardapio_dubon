import { useState, useEffect, useCallback, useRef } from 'react'
import api from '../lib/api'
import Modal from '../components/Modal'
import { isAdmin } from '../lib/auth'

const fmt = (v) => 'R$ ' + Number(v).toFixed(2).replace('.', ',')
const TIPO_LABEL = { CREDITO: 'Crédito', DEBITO: 'Débito' }

function hojeISO() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}

function addDias(iso, n) {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + n)
  return dt.toISOString().slice(0, 10)
}

function infoData(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d, 12))
  const partes = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', weekday: 'long', month: 'long' }).formatToParts(dt)
  const weekday = partes.find((p) => p.type === 'weekday').value
  const mes = partes.find((p) => p.type === 'month').value
  return { diaSemana: weekday.charAt(0).toUpperCase() + weekday.slice(1), diaMes: d, mes }
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  )
}

export default function Cartao() {
  const admin = isAdmin()
  const [data, setData] = useState(hojeISO())
  const [bandeiras, setBandeiras] = useState([])
  const [dia, setDia] = useState(null)
  const [loading, setLoading] = useState(true)
  const [pendencias, setPendencias] = useState([])
  const [bandeiraModal, setBandeiraModal] = useState(null) // { mode: 'add'|'edit', data }

  const hoje = hojeISO()
  const limite = addDias(hoje, -9)
  const dentroDaJanela = data >= limite && data <= hoje
  const podeEditar = admin || dentroDaJanela

  // silencioso=true (usado depois de salvar/editar/remover uma venda) não mexe
  // no "loading" — evita o piscar de "Carregando…" que desmontava a grade
  // inteira a cada lançamento e derrubava o foco do campo seguinte.
  const carregarDia = useCallback(async (silencioso = false) => {
    if (!silencioso) setLoading(true)
    try {
      const { data: resp } = await api.get('/api/admin/cartao/dia', { params: { data } })
      setDia(resp)
    } catch {
      setDia({ colunas: [] })
    } finally {
      if (!silencioso) setLoading(false)
    }
  }, [data])

  const carregarBandeiras = useCallback(async () => {
    try {
      const { data } = await api.get('/api/admin/cartao/bandeiras')
      setBandeiras(data)
    } catch {}
  }, [])

  const carregarPendencias = useCallback(async () => {
    if (!admin) return
    try {
      const { data } = await api.get('/api/admin/cartao/pendencias')
      setPendencias(data)
    } catch {}
  }, [admin])

  useEffect(() => { carregarDia() }, [carregarDia])
  useEffect(() => { carregarBandeiras() }, [carregarBandeiras])
  useEffect(() => { carregarPendencias() }, [carregarPendencias, dia])

  async function adicionarVenda(bandeiraId, valor) {
    await api.post(`/api/admin/cartao/dia/${bandeiraId}/vendas`, { valor }, { params: { data } })
    await carregarDia(true)
  }

  async function editarVenda(vendaId, valor) {
    await api.patch(`/api/admin/cartao/vendas/${vendaId}`, { valor })
    await carregarDia(true)
  }

  async function removerVenda(vendaId) {
    await api.delete(`/api/admin/cartao/vendas/${vendaId}`)
    await carregarDia(true)
  }

  async function mudarStatus(bandeiraId, status) {
    await api.patch(`/api/admin/cartao/dia/${bandeiraId}/status`, { status }, { params: { data } })
    await carregarDia(true)
    await carregarPendencias()
  }

  async function salvarBandeira(form) {
    if (bandeiraModal.mode === 'edit') {
      await api.patch(`/api/admin/cartao/bandeiras/${bandeiraModal.data.id}`, {
        nome: form.nome,
        taxaAtual: form.taxaAtual,
        ativo: form.ativo,
      })
    } else {
      await api.post('/api/admin/cartao/bandeiras', {
        nome: form.nome,
        tipo: form.tipo,
        taxaAtual: form.taxaAtual,
      })
    }
    await carregarBandeiras()
    await carregarDia()
  }

  const { diaSemana, diaMes, mes } = infoData(data)

  return (
    <div className="space-y-6">
      {/* Cabeçalho de data */}
      <div className="bg-white rounded-2xl shadow-sm border p-6 text-center">
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => setData(addDias(data, -1))}
            disabled={!admin && addDias(data, -1) < limite}
            className="text-3xl text-gray-300 hover:text-gray-600 disabled:opacity-30 disabled:hover:text-gray-300 px-2"
          >
            ‹
          </button>
          <div>
            <div className="text-6xl font-bold text-gray-800 leading-none">{diaMes}</div>
            <div className="text-lg font-semibold text-brand capitalize mt-1">{diaSemana} · {mes}</div>
          </div>
          <button
            onClick={() => setData(addDias(data, 1))}
            disabled={!admin && addDias(data, 1) > hoje}
            className="text-3xl text-gray-300 hover:text-gray-600 disabled:opacity-30 disabled:hover:text-gray-300 px-2"
          >
            ›
          </button>
        </div>
        {data !== hoje && (
          <button onClick={() => setData(hoje)} className="text-xs text-brand hover:underline mt-2">
            Voltar pra hoje
          </button>
        )}
        {!admin && !dentroDaJanela && (
          <p className="text-sm text-red-500 mt-2">Fora do período que você pode editar (só os últimos 10 dias)</p>
        )}
      </div>

      {/* Bandeiras/taxas — só gerente */}
      {admin && (
        <div className="bg-white rounded-2xl shadow-sm border p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-800">Taxas por bandeira</h3>
            <button
              onClick={() => setBandeiraModal({ mode: 'add', data: null })}
              className="text-sm text-brand font-medium hover:underline"
            >
              + Bandeira
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {bandeiras.map((b) => (
              <button
                key={b.id}
                onClick={() => setBandeiraModal({ mode: 'edit', data: b })}
                className={`flex items-center gap-2 border rounded-xl px-3 py-2 text-sm ${
                  b.ativo ? 'bg-gray-50 hover:bg-gray-100 border-gray-200' : 'bg-gray-50 opacity-50 border-gray-200'
                }`}
              >
                <span className="font-medium text-gray-700">{b.nome} {TIPO_LABEL[b.tipo]}</span>
                <span className="text-brand font-bold">{Number(b.taxaAtual)}%</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Pendências — só gerente */}
      {admin && pendencias.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
          <h3 className="font-semibold text-red-700 mb-2">⚠️ Pendências pra conferir</h3>
          <div className="flex flex-wrap gap-2">
            {pendencias.map((p) => (
              <button
                key={`${p.data}-${p.bandeiraId}`}
                onClick={() => setData(p.data)}
                className="text-sm bg-white border border-red-300 text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-100"
              >
                {p.nome} {TIPO_LABEL[p.tipo]} · {p.data.split('-').reverse().join('/')}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Grade principal */}
      {loading ? (
        <div className="text-center py-16 text-gray-400">Carregando…</div>
      ) : !dia || dia.colunas.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          {!admin && !dentroDaJanela ? 'Sem acesso a esse dia' : 'Nada pendente aqui — tudo já conferido!'}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
          {dia.colunas.map((col) => (
            <ColunaBandeira
              key={col.bandeiraId}
              col={col}
              admin={admin}
              podeEditar={podeEditar}
              onAdicionar={(valor) => adicionarVenda(col.bandeiraId, valor)}
              onEditar={editarVenda}
              onRemover={removerVenda}
              onStatus={(status) => mudarStatus(col.bandeiraId, status)}
            />
          ))}
        </div>
      )}

      {/* Totais — só gerente */}
      {admin && dia && dia.colunas.length > 0 && (
        <div className="bg-gray-800 text-white rounded-2xl p-5 grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-sm text-gray-400">Total geral</div>
            <div className="text-2xl font-bold">{fmt(dia.totalGeral)}</div>
          </div>
          <div>
            <div className="text-sm text-gray-400">Total de taxa</div>
            <div className="text-2xl font-bold text-red-300">-{fmt(dia.totalTaxa)}</div>
          </div>
          <div>
            <div className="text-sm text-gray-400">Líquido no banco</div>
            <div className="text-2xl font-bold text-emerald-300">{fmt(dia.totalLiquido)}</div>
          </div>
        </div>
      )}

      {bandeiraModal && (
        <BandeiraFormModal
          mode={bandeiraModal.mode}
          initial={bandeiraModal.data}
          onClose={() => setBandeiraModal(null)}
          onSave={salvarBandeira}
        />
      )}
    </div>
  )
}

function ColunaBandeira({ col, admin, podeEditar, onAdicionar, onEditar, onRemover, onStatus }) {
  // 2 campos "novo valor" sempre abertos, alternando o foco entre eles no Enter
  // — assim dá pra digitar vários lançamentos seguidos sem esperar o servidor nem clicar de novo.
  const [slots, setSlots] = useState(['', ''])
  const [salvandoSlot, setSalvandoSlot] = useState([false, false])
  const vendaInputRefs = useRef([])
  const slotRefs = useRef([])
  // Enter chama confirmarSlot e já troca o foco; isso dispara um blur "de verdade"
  // no campo que perdeu o foco — essa flag avisa o onBlur pra não salvar de novo.
  const enterSlotRef = useRef([false, false])

  async function confirmarSlot(idx) {
    const v = parseFloat(String(slots[idx]).replace(',', '.'))
    if (!v || v <= 0) return
    setSlots((s) => { const n = [...s]; n[idx] = ''; return n })
    setSalvandoSlot((s) => { const n = [...s]; n[idx] = true; return n })
    try {
      await onAdicionar(v)
    } finally {
      setSalvandoSlot((s) => { const n = [...s]; n[idx] = false; return n })
    }
  }

  function focarProximaVenda(i) {
    (vendaInputRefs.current[i + 1] || slotRefs.current[0])?.focus()
  }

  function focarOutroSlot(idx) {
    slotRefs.current[idx === 0 ? 1 : 0]?.focus()
  }

  const statusStyle = {
    CORRETO: 'border-emerald-300',
    INCORRETO: 'border-red-300',
    PENDENTE: 'border-gray-200',
  }[col.status]

  return (
    <div className={`bg-white rounded-2xl shadow-sm border-2 p-3 flex flex-col gap-2 ${statusStyle}`}>
      <div className="text-center">
        <div className="font-bold text-gray-800 text-sm">{col.nome}</div>
        <div className="text-xs">
          <span className={col.tipo === 'CREDITO' ? 'text-orange-500 font-semibold' : 'text-blue-500 font-semibold'}>
            {TIPO_LABEL[col.tipo]}
          </span>
          {admin && <span className="text-gray-400"> · {col.taxa}%</span>}
        </div>
      </div>

      <div className="space-y-1 flex-1">
        {col.vendas.map((v, i) => (
          <VendaInput
            key={v.id}
            valor={v.valor}
            onSalvar={(novo) => onEditar(v.id, novo)}
            onRemover={() => onRemover(v.id)}
            somenteLeitura={!podeEditar}
            inputRef={(el) => { vendaInputRefs.current[i] = el }}
            onEnterFoco={() => focarProximaVenda(i)}
          />
        ))}
        {podeEditar && slots.map((valor, idx) => (
          <input
            key={idx}
            ref={(el) => { slotRefs.current[idx] = el }}
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={valor}
            disabled={salvandoSlot[idx]}
            onChange={(e) => setSlots((s) => { const n = [...s]; n[idx] = e.target.value; return n })}
            onBlur={() => {
              if (enterSlotRef.current[idx]) { enterSlotRef.current[idx] = false; return }
              confirmarSlot(idx)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                enterSlotRef.current[idx] = true
                confirmarSlot(idx)
                focarOutroSlot(idx)
              }
            }}
            placeholder="+ valor"
            className="w-full border border-dashed border-gray-300 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-brand"
          />
        ))}
      </div>

      {admin && (
        <>
          <div className="text-center border-t pt-2">
            <div className="font-bold text-gray-700">{fmt(col.total)}</div>
            <div className="text-xs text-gray-400">
              -{fmt(col.taxaValor)} taxa · <span className="text-emerald-600 font-semibold">líq. {fmt(col.liquido)}</span>
            </div>
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => onStatus(col.status === 'CORRETO' ? 'PENDENTE' : 'CORRETO')}
              className={`flex-1 text-xs py-1.5 rounded-lg font-semibold ${
                col.status === 'CORRETO' ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-emerald-100'
              }`}
            >
              ✓ Correto
            </button>
            <button
              onClick={() => onStatus(col.status === 'INCORRETO' ? 'PENDENTE' : 'INCORRETO')}
              className={`flex-1 text-xs py-1.5 rounded-lg font-semibold ${
                col.status === 'INCORRETO' ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-red-100'
              }`}
            >
              ✕ Incorreto
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function VendaInput({ valor, onSalvar, onRemover, somenteLeitura, inputRef, onEnterFoco }) {
  const [v, setV] = useState(String(valor))
  const [salvando, setSalvando] = useState(false)
  // mesma lógica do slot: Enter já confirma e troca o foco; a flag evita que o
  // blur disparado por essa troca de foco acabe salvando o mesmo valor de novo.
  const enterRef = useRef(false)

  async function confirmar() {
    const num = parseFloat(String(v).replace(',', '.'))
    if (!num || num <= 0 || num === valor) { setV(String(valor)); return }
    setSalvando(true)
    try { await onSalvar(num) } finally { setSalvando(false) }
  }

  if (somenteLeitura) {
    return <div className="text-sm text-center py-1.5 text-gray-600">{fmt(valor)}</div>
  }

  return (
    <div className="flex items-center gap-1">
      <input
        ref={inputRef}
        type="number"
        inputMode="decimal"
        min="0"
        step="0.01"
        value={v}
        disabled={salvando}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          if (enterRef.current) { enterRef.current = false; return }
          confirmar()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            enterRef.current = true
            confirmar()
            onEnterFoco?.()
          }
        }}
        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-brand"
      />
      <button onClick={onRemover} className="text-gray-300 hover:text-red-400 text-lg leading-none px-1">×</button>
    </div>
  )
}

function BandeiraFormModal({ mode, initial, onClose, onSave }) {
  const [form, setForm] = useState({
    nome: initial?.nome || '',
    tipo: initial?.tipo || 'CREDITO',
    taxaAtual: initial?.taxaAtual != null ? String(initial.taxaAtual) : '',
    ativo: initial?.ativo ?? true,
  })
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })) }

  async function salvar() {
    setErro('')
    const taxa = parseFloat(String(form.taxaAtual).replace(',', '.'))
    if (!form.nome.trim()) { setErro('Informe o nome'); return }
    if (isNaN(taxa) || taxa < 0) { setErro('Taxa inválida'); return }
    setSaving(true)
    try {
      await onSave({ ...form, taxaAtual: taxa })
      onClose()
    } catch (err) {
      setErro(err.response?.data?.error || 'Erro ao salvar')
      setSaving(false)
    }
  }

  return (
    <Modal
      title={mode === 'edit' ? 'Editar bandeira' : 'Nova bandeira'}
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
        <Field label="Nome">
          <input className="input" value={form.nome} onChange={(e) => set('nome', e.target.value)} placeholder="Ex: Visa" autoFocus />
        </Field>
        {mode !== 'edit' && (
          <Field label="Tipo">
            <select className="input" value={form.tipo} onChange={(e) => set('tipo', e.target.value)}>
              <option value="CREDITO">Crédito</option>
              <option value="DEBITO">Débito</option>
            </select>
          </Field>
        )}
        <Field label="Taxa (%)">
          <input
            className="input"
            type="number"
            min="0"
            step="0.01"
            value={form.taxaAtual}
            onChange={(e) => set('taxaAtual', e.target.value)}
            placeholder="0,00"
          />
        </Field>
        {mode === 'edit' && (
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.ativo} onChange={(e) => set('ativo', e.target.checked)} className="w-4 h-4 accent-brand rounded" />
            <span className="text-sm text-gray-600">Ativa</span>
          </label>
        )}
        {erro && <p className="text-red-600 text-sm">{erro}</p>}
      </div>
    </Modal>
  )
}
