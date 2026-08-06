import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { getRole, clearRole, isPrincipal, ROLE_LABELS } from '../lib/offline/role'
import { useOnlineStatus } from '../lib/offline/useOnlineStatus'
import * as ops from '../lib/offline/operations'
import SyncStatusBadge from '../components/SyncStatusBadge'

function fmt(valor) {
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function nomeComanda(c) {
  return (!c.clienteNome || c.clienteNome === '—') ? `#${c.id}` : c.clienteNome
}

// ─── Denominações ─────────────────────────────────────────────────────────────
const DENOMS = [0.05, 0.10, 0.25, 0.50, 1, 2, 5, 10, 20, 50, 100, 200]

function initDenoms() {
  return Object.fromEntries(DENOMS.map((d) => [String(d), 0]))
}

function calcTotal(denoms) {
  return DENOMS.reduce((acc, d) => acc + d * (denoms[String(d)] || 0), 0)
}

function brDataInfo() {
  const agora = new Date()
  const partes = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'long', day: '2-digit', month: '2-digit', year: '2-digit',
  }).formatToParts(agora)
  const weekday = partes.find((p) => p.type === 'weekday').value
  const day = partes.find((p) => p.type === 'day').value
  const month = partes.find((p) => p.type === 'month').value
  const year = partes.find((p) => p.type === 'year').value
  const abrev = weekday.slice(0, 3)
  return {
    dataStr: `${day}/${month}/${year}`,
    diaSemana: weekday,
    diaSemanaAbrev: abrev.charAt(0).toUpperCase() + abrev.slice(1),
    artigo: weekday.endsWith('-feira') ? 'da' : 'do',
  }
}

function DenomGrid({ value, onChange }) {
  const inputRefs = useRef([])

  function handleKeyDown(e, idx) {
    if (e.key === 'Enter') {
      e.preventDefault()
      const next = inputRefs.current[idx + 1]
      if (next) next.focus()
    }
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {DENOMS.map((d, idx) => {
        const key = String(d)
        const label = d < 1
          ? `${Math.round(d * 100)}¢`
          : `R$${d % 1 === 0 ? d : d.toFixed(2)}`
        return (
          <div key={key} className="flex flex-col items-center gap-1">
            <span className="text-xs text-slate-500 font-medium">{label}</span>
            <input
              ref={(el) => { inputRefs.current[idx] = el }}
              type="number"
              min="0"
              value={value[key] === 0 ? '' : value[key]}
              onChange={(e) => onChange({ ...value, [key]: e.target.value === '' ? 0 : Math.max(0, parseInt(e.target.value) || 0) })}
              onKeyDown={(e) => handleKeyDown(e, idx)}
              placeholder="0"
              className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-center text-base font-bold focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
        )
      })}
    </div>
  )
}

// ─── Modal genérico ──────────────────────────────────────────────────────────
function Modal({ title, children, onClose, onConfirm, confirmLabel = 'Confirmar', confirmClass = 'bg-brand text-white', loading = false, danger = false }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-sm max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-800">{title}</h2>
        </div>
        <div className="p-5 space-y-4">{children}</div>
        {onConfirm && (
          <div className="px-5 pb-5 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-slate-300 text-slate-700 font-semibold py-2.5 rounded-xl"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={loading}
              className={`flex-1 font-semibold py-2.5 rounded-xl disabled:opacity-50 ${confirmClass}`}
            >
              {loading ? 'Aguarde…' : confirmLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Modal Abrir Caixa ───────────────────────────────────────────────────────
function AbrirCaixaModal({ naoFechado, onClose, onAberto }) {
  const [denoms, setDenoms] = useState(initDenoms())
  const [abertoPor, setAbertoPor] = useState('')
  const [responsavel, setResponsavel] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const { diaSemana, dataStr, artigo } = brDataInfo()

  const total = calcTotal(denoms)

  async function handleAbrir() {
    if (naoFechado && !responsavel.trim()) {
      setErro('Informe o responsável pelo caixa não fechado')
      return
    }
    if (!abertoPor.trim()) {
      setErro('Informe o nome de quem está abrindo')
      return
    }
    setErro('')
    setLoading(true)
    try {
      const data = await ops.abrirCaixa({
        denominacoes: denoms,
        abertoPor: abertoPor.trim() || undefined,
        responsavelNaoFechamento: responsavel.trim() || undefined,
        fecharAnterior: !!naoFechado,
      })
      onAberto(data)
    } catch (err) {
      setErro(err.response?.data?.error || 'Erro ao abrir caixa')
      setLoading(false)
    }
  }

  return (
    <Modal
      title="Abrir Caixa"
      onClose={onClose}
      onConfirm={handleAbrir}
      confirmLabel="Abrir Caixa"
      loading={loading}
    >
      <p className="text-sm text-slate-500 bg-slate-50 rounded-xl px-4 py-2.5">
        Você está abrindo o caixa{' '}
        <span className="font-semibold text-slate-700">{artigo} {diaSemana}</span>
        , dia <span className="font-semibold text-slate-700">{dataStr}</span>
      </p>

      {naoFechado && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3 text-sm">
          <p className="font-semibold mb-1">⚠️ Caixa anterior não fechado</p>
          <p>O caixa do dia anterior não foi fechado. Informe o responsável:</p>
          <input
            type="text"
            value={responsavel}
            onChange={(e) => setResponsavel(e.target.value)}
            placeholder="Nome do responsável *"
            className="mt-2 w-full border border-amber-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </div>
      )}

      <div>
        <label className="text-sm font-medium text-slate-600 mb-2 block">Aberto por *</label>
        <input
          type="text"
          value={abertoPor}
          onChange={(e) => setAbertoPor(e.target.value)}
          placeholder="Nome de quem está abrindo"
          className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-brand"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-slate-600">Contagem das cédulas/moedas</label>
          <span className="font-bold text-brand">{fmt(total)}</span>
        </div>
        <DenomGrid value={denoms} onChange={setDenoms} />
      </div>

      {erro && <p className="text-red-600 text-sm">{erro}</p>}
    </Modal>
  )
}

// ─── Modal Fechar Caixa ──────────────────────────────────────────────────────
function FecharCaixaModal({ onClose, onFechado }) {
  const [denoms, setDenoms] = useState(initDenoms())
  const [fechadoPor, setFechadoPor] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const { diaSemana, dataStr, artigo } = brDataInfo()

  const total = calcTotal(denoms)

  async function handleFechar() {
    if (!fechadoPor.trim()) {
      setErro('Informe o nome de quem está fechando')
      return
    }
    setErro('')
    setLoading(true)
    try {
      const data = await ops.fecharCaixa({ denominacoes: denoms, fechadoPor: fechadoPor.trim() })
      onFechado(data)
    } catch (err) {
      setErro(err.response?.data?.error || 'Erro ao fechar caixa')
      setLoading(false)
    }
  }

  return (
    <Modal
      title="Fechar Caixa"
      onClose={onClose}
      onConfirm={handleFechar}
      confirmLabel="Fechar Caixa"
      confirmClass="bg-red-600 text-white"
      loading={loading}
    >
      <p className="text-sm text-slate-500 bg-slate-50 rounded-xl px-4 py-2.5">
        Você está fechando o caixa{' '}
        <span className="font-semibold text-slate-700">{artigo} {diaSemana}</span>
        , dia <span className="font-semibold text-slate-700">{dataStr}</span>
      </p>

      <div>
        <label className="text-sm font-medium text-slate-600 mb-2 block">Fechado por *</label>
        <input
          type="text"
          value={fechadoPor}
          onChange={(e) => setFechadoPor(e.target.value)}
          placeholder="Nome de quem está fechando"
          className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-brand"
        />
      </div>
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-slate-600">Contagem das cédulas/moedas</label>
          <span className="font-bold text-brand">{fmt(total)}</span>
        </div>
        <DenomGrid value={denoms} onChange={setDenoms} />
      </div>
      {erro && <p className="text-red-600 text-sm">{erro}</p>}
    </Modal>
  )
}

// ─── Modal Movimentação ──────────────────────────────────────────────────────
const TIPO_MOV_OPTS = [
  { value: 'SANGRIA',    label: 'Sangria' },
  { value: 'ALIMENTACAO', label: 'Alimentação' },
  { value: 'OUTROS',     label: 'Outros' },
  { value: 'TROCO',      label: 'Troco' },
]

function MovimentacaoModal({ onClose, onRegistrada }) {
  const [tipo, setTipo] = useState('SANGRIA')
  const [nome, setNome] = useState('')
  const [valor, setValor] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const valorRef = useRef(null)

  useEffect(() => { valorRef.current?.focus() }, [])

  async function handleRegistrar() {
    if (!nome.trim()) { setErro('Informe uma descrição'); return }
    const v = parseFloat(valor.replace(',', '.'))
    if (!v || v <= 0) { setErro('Informe um valor válido'); return }
    setErro('')
    setLoading(true)
    try {
      const data = await ops.registrarMovimentacao({
        tipo,
        nome: nome.trim(),
        valor: v,
      })
      onRegistrada(data)
    } catch (err) {
      setErro(err.response?.data?.error || 'Erro ao registrar movimentação')
      setLoading(false)
    }
  }

  return (
    <Modal
      title="Movimentação de Caixa"
      onClose={onClose}
      onConfirm={handleRegistrar}
      confirmLabel="Registrar"
      loading={loading}
    >
      <div>
        <label className="text-sm font-medium text-slate-600 mb-2 block">Tipo</label>
        <div className="grid grid-cols-2 gap-2">
          {TIPO_MOV_OPTS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setTipo(o.value)}
              className={`py-2 rounded-xl text-sm font-semibold border transition-colors ${
                tipo === o.value
                  ? 'bg-brand text-white border-brand'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-sm font-medium text-slate-600 mb-1 block">Descrição</label>
        <input
          type="text"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Ex: Sangria para cofre"
          className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-brand"
        />
      </div>

      <div>
        <label className="text-sm font-medium text-slate-600 mb-1 block">Valor (R$)</label>
        <input
          ref={valorRef}
          type="text"
          inputMode="decimal"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleRegistrar() }}
          placeholder="0,00"
          className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-brand"
        />
      </div>

      {erro && <p className="text-red-600 text-sm">{erro}</p>}
    </Modal>
  )
}

// ─── Modal Nova Comanda ──────────────────────────────────────────────────────
function NovaComandaModal({ onClose, onCreate }) {
  const [nome, setNome] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setErro('')
    setLoading(true)
    try {
      const data = await ops.criarComanda({ clienteNome: nome.trim() })
      onCreate(data)
    } catch (err) {
      setErro(err.response?.data?.error || 'Erro ao criar comanda')
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-xl font-bold text-slate-800 mb-1">Nova Comanda</h2>
        <p className="text-sm text-slate-400 mb-4">Nome do cliente é opcional</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Nome do cliente (opcional)"
            className="w-full border border-slate-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand"
            autoFocus
          />
          {erro && <p className="text-red-600 text-sm">{erro}</p>}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-slate-300 text-slate-700 font-semibold py-3 rounded-xl"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-brand text-white font-semibold py-3 rounded-xl disabled:opacity-50"
            >
              {loading ? 'Criando…' : 'Abrir'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Componente principal ────────────────────────────────────────────────────
export default function PDV() {
  const [comandas, setComandas] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNovaComanda, setShowNovaComanda] = useState(false)
  const [showAbrirCaixa, setShowAbrirCaixa] = useState(false)
  const [showFecharCaixa, setShowFecharCaixa] = useState(false)
  const [showMovimentacao, setShowMovimentacao] = useState(false)
  const [caixa, setCaixa] = useState(null)        // caixa do dia (ou null)
  const [naoFechado, setNaoFechado] = useState(null) // caixa anterior não fechado
  const [caixaLoading, setCaixaLoading] = useState(true)
  const navigate = useNavigate()
  const online = useOnlineStatus()
  const bloqueado = !isPrincipal() && !online

  const carregarCaixa = useCallback(async () => {
    try {
      const data = await ops.carregarCaixaHoje()
      setCaixa(data.caixa)
      setNaoFechado(data.naoFechado)
    } catch {
      // silent
    } finally {
      setCaixaLoading(false)
    }
  }, [])

  const carregarComandas = useCallback(async () => {
    try {
      const data = await ops.listarComandas()
      setComandas(data)
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    carregarCaixa()
    carregarComandas()
    const interval = setInterval(carregarComandas, 15000)
    return () => clearInterval(interval)
  }, [carregarCaixa, carregarComandas])

  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Enter') return
      const tag = document.activeElement?.tagName?.toLowerCase()
      if (['input', 'textarea', 'select', 'button'].includes(tag)) return
      if (caixa?.status === 'ABERTO' && !showNovaComanda && !showAbrirCaixa && !showFecharCaixa && !showMovimentacao) {
        e.preventDefault()
        setShowNovaComanda(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [caixa, showNovaComanda, showAbrirCaixa, showFecharCaixa, showMovimentacao])

  function handleCriada(comanda) {
    setShowNovaComanda(false)
    navigate(`/comanda/${comanda.id}`)
  }

  function sair() {
    if (!window.confirm('Sair do PDV?')) return
    localStorage.removeItem('dubon_pdv_token')
    navigate('/login', { replace: true })
  }

  function trocarDispositivo() {
    if (!window.confirm('Trocar o papel deste dispositivo (principal/secundário/tablet)?')) return
    clearRole()
    window.location.reload()
  }

  const caixaAberto = caixa?.status === 'ABERTO'
  const caixaFechado = caixa?.status === 'FECHADO'
  const dataHoje = brDataInfo()

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <header className="bg-brand text-white px-4 py-3 flex items-center justify-between shadow-md sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🍦</span>
          <div>
            <p className="font-bold text-base leading-tight">Dubon PDV</p>
            <p className="text-xs text-blue-200 leading-tight">
              Balcão · {dataHoje.diaSemanaAbrev} {dataHoje.dataStr}
              {' · '}
              <button
                type="button"
                onClick={trocarDispositivo}
                className="underline decoration-dotted hover:text-white"
                title="Trocar o papel deste dispositivo"
              >
                {ROLE_LABELS[getRole()] || 'Dispositivo'}
              </button>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <SyncStatusBadge />
          <button
            onClick={() => navigate('/historico')}
            className="text-sm bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg"
          >
            Histórico
          </button>
          <button
            onClick={sair}
            className="text-sm bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg"
          >
            Sair
          </button>
        </div>
      </header>

      <main className="p-4 max-w-4xl mx-auto">
        {bloqueado && (
          <div className="rounded-2xl p-3 mb-4 bg-slate-800 text-white text-sm font-semibold text-center">
            🔒 Sem conexão — use o computador principal para novas ações
          </div>
        )}
        {/* Barra de caixa */}
        {!caixaLoading && (
          <div className={`rounded-2xl p-4 mb-4 flex items-center justify-between gap-3 ${
            caixaAberto
              ? 'bg-emerald-50 border border-emerald-200'
              : caixaFechado
              ? 'bg-slate-100 border border-slate-200'
              : 'bg-amber-50 border border-amber-200'
          }`}>
            <div>
              <p className={`font-semibold text-sm ${
                caixaAberto ? 'text-emerald-700' : caixaFechado ? 'text-slate-500' : 'text-amber-700'
              }`}>
                {caixaAberto
                  ? '✅ Caixa aberto'
                  : caixaFechado
                  ? '🔒 Caixa fechado'
                  : '⚠️ Caixa não aberto'}
              </p>
              {caixaAberto && caixa?.abertoPor && (
                <p className="text-xs text-emerald-600">Aberto por {caixa.abertoPor}</p>
              )}
              {!caixaAberto && !caixaFechado && (
                <p className="text-xs text-amber-600">Abra o caixa para criar comandas</p>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              {caixaAberto && (
                <>
                  <button
                    onClick={() => setShowMovimentacao(true)}
                    disabled={bloqueado}
                    className="text-sm bg-white border border-emerald-200 text-emerald-700 font-semibold px-3 py-1.5 rounded-xl hover:bg-emerald-50 disabled:opacity-40"
                  >
                    + Movimentação
                  </button>
                  <button
                    onClick={() => setShowFecharCaixa(true)}
                    disabled={bloqueado}
                    className="text-sm bg-red-600 text-white font-semibold px-3 py-1.5 rounded-xl hover:bg-red-700 disabled:opacity-40"
                  >
                    Fechar caixa
                  </button>
                </>
              )}
              {!caixaAberto && !caixaFechado && (
                <button
                  onClick={() => setShowAbrirCaixa(true)}
                  disabled={bloqueado}
                  className="text-sm bg-emerald-600 text-white font-semibold px-4 py-2 rounded-xl hover:bg-emerald-700 disabled:opacity-40"
                >
                  Abrir Caixa
                </button>
              )}
            </div>
          </div>
        )}

        {/* Nova comanda */}
        <button
          onClick={() => caixaAberto && setShowNovaComanda(true)}
          disabled={!caixaAberto || bloqueado}
          className="w-full bg-brand text-white font-bold text-lg py-4 rounded-2xl shadow-md mb-5 flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-40 disabled:active:scale-100"
        >
          <span className="text-2xl">+</span> Nova Comanda
        </button>

        {/* Movimentações do dia */}
        {caixaAberto && caixa?.movimentacoes?.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 mb-4">
            <h3 className="text-sm font-semibold text-slate-600 mb-2">Movimentações de hoje</h3>
            <div className="space-y-1">
              {caixa.movimentacoes.map((m) => (
                <div key={m.id} className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">{m.nome}</span>
                  <span className={`font-semibold ${m.tipo === 'TROCO' ? 'text-emerald-600' : 'text-red-500'}`}>
                    {m.tipo === 'TROCO' ? '+' : '-'}{fmt(m.valor)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Comandas abertas */}
        {loading ? (
          <p className="text-center text-slate-400 py-12">Carregando…</p>
        ) : comandas.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <div className="text-5xl mb-3">📋</div>
            <p className="font-medium">Nenhuma comanda aberta</p>
            <p className="text-sm mt-1">
              {caixaAberto ? 'Toque em "Nova Comanda" para começar' : 'Abra o caixa para criar comandas'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {comandas.map((c) => (
              <button
                key={c.id}
                onClick={() => navigate(`/comanda/${c.id}`)}
                className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 text-left active:scale-95 transition-transform w-full"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-800 text-xl truncate">{nomeComanda(c)}</p>
                    <p className="text-base text-slate-500 mt-0.5">
                      {c.itens.length} {c.itens.length === 1 ? 'item' : 'itens'}
                    </p>
                  </div>
                  <span className="text-brand font-bold text-2xl shrink-0">{fmt(c.total)}</span>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-sm text-slate-400">
                    {new Date(c.criadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}
                  </span>
                  <span className="text-sm bg-emerald-100 text-emerald-700 font-semibold px-2 py-0.5 rounded-full">
                    ABERTO
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>

      {/* Modals */}
      {showNovaComanda && (
        <NovaComandaModal onClose={() => setShowNovaComanda(false)} onCreate={handleCriada} />
      )}
      {showAbrirCaixa && (
        <AbrirCaixaModal
          naoFechado={naoFechado}
          onClose={() => setShowAbrirCaixa(false)}
          onAberto={(c) => { setCaixa(c); setNaoFechado(null); setShowAbrirCaixa(false) }}
        />
      )}
      {showFecharCaixa && (
        <FecharCaixaModal
          onClose={() => setShowFecharCaixa(false)}
          onFechado={(c) => { setCaixa(c); setShowFecharCaixa(false) }}
        />
      )}
      {showMovimentacao && (
        <MovimentacaoModal
          onClose={() => setShowMovimentacao(false)}
          onRegistrada={(mov) => {
            setCaixa((prev) => prev
              ? { ...prev, movimentacoes: [...(prev.movimentacoes || []), mov] }
              : prev
            )
            setShowMovimentacao(false)
          }}
        />
      )}
    </div>
  )
}
