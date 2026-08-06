import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import * as ops from '../lib/offline/operations'
import { isPrincipal } from '../lib/offline/role'
import { useOnlineStatus } from '../lib/offline/useOnlineStatus'
import SyncStatusBadge from '../components/SyncStatusBadge'

function fmt(valor) {
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function nomeComanda(c) {
  return (!c.clienteNome || c.clienteNome === '—') ? `#${c.id}` : c.clienteNome
}

function tipoLabel(tipo) {
  const map = { KILO: 'Kilo', KILO_BOLO: 'Kilo Bolo', POTE: 'Pote', PICOLE: 'Picolé', BEBIDA: 'Bebida', CASQUINHA: 'Casquinha', TACA: 'Taça', OUTROS: 'Outros' }
  return map[tipo] || tipo
}

function displayQtd(item) {
  if (item.tipo === 'KILO' || item.tipo === 'KILO_BOLO' || item.tipo === 'OUTROS') return '—'
  return `${item.quantidade}×`
}

function resolverFaixaPreco(faixas, total) {
  if (!faixas?.length) return null
  const sorted = [...faixas].sort((a, b) => b.quantidadeMinima - a.quantidadeMinima)
  for (const f of sorted) {
    if (total >= f.quantidadeMinima) return Number(f.preco)
  }
  return Number(sorted[sorted.length - 1].preco)
}

function mesmoPool(rawCats, cat, outroCatId) {
  if (!cat.poolId) return false
  const outra = rawCats.find((c) => c.id === outroCatId)
  return outra?.poolId === cat.poolId
}

function contarPicolesMesmoPool(itens, rawCats, cat) {
  return itens
    .filter((i) => {
      if (i.tipo !== 'PICOLE') return false
      if (!cat.poolId) return i.categoriaId === cat.id
      return mesmoPool(rawCats, cat, i.categoriaId) || i.categoriaId === cat.id
    })
    .reduce((s, i) => s + i.quantidade, 0)
}

function tipoBackendFromCat(cat) {
  if (!cat) return 'POTE'
  const map = { KILO: 'KILO', POTE: 'POTE', PICOLE: 'PICOLE', BEBIDA: 'BEBIDA', CASQUINHA: 'CASQUINHA', TACA: 'TACA', OUTROS: 'OUTROS' }
  return map[cat.tipo] || 'POTE'
}

function buildPicolePayload(cat, rawCats, comanda, quantidade, pu) {
  const totalApos = contarPicolesMesmoPool(comanda.itens, rawCats, cat) + quantidade
  const categoriaPrecos = { [cat.id]: pu }
  const outrosCatIds = [
    ...new Set(
      comanda.itens
        .filter((i) => i.tipo === 'PICOLE' && i.categoriaId && i.categoriaId !== cat.id && mesmoPool(rawCats, cat, i.categoriaId))
        .map((i) => i.categoriaId)
    ),
  ]
  for (const outCatId of outrosCatIds) {
    const outCat = rawCats.find((c) => c.id === outCatId)
    if (outCat) categoriaPrecos[outCatId] = resolverFaixaPreco(outCat.precosPorQuantidade, totalApos)
  }
  return { tipo: 'PICOLE', descricao: cat.nome, quantidade, valorUnitario: pu, categoriaId: cat.id, categoriaPrecos }
}

const OUTROS_CAT = {
  id: '__OUTROS__',
  nome: 'Outros',
  emoji: '🛍️',
  tipo: 'OUTROS',
  produtos: [],
  precosPorQuantidade: [],
}

// ─── Modal genérico de confirmação / erro ─────────────────────────────────────

function Modal({ mensagem, onConfirmar, onCancelar, confirmarLabel = 'Confirmar', cancelarLabel = 'Cancelar', perigoso = false }) {
  const confirmarRef = useRef(null)

  useEffect(() => {
    confirmarRef.current?.focus()
    function handleKey(e) {
      if (e.key === 'Enter') { e.preventDefault(); onConfirmar() }
      if (e.key === 'Escape' && onCancelar) { e.preventDefault(); onCancelar() }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onConfirmar, onCancelar])

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <p className="text-slate-700 text-base mb-6 leading-relaxed whitespace-pre-line">{mensagem}</p>
        <div className="flex gap-3">
          {onCancelar && (
            <button type="button" onClick={onCancelar}
              className="flex-1 border border-slate-300 text-slate-700 font-semibold py-3 rounded-xl hover:bg-slate-50">
              {cancelarLabel}
            </button>
          )}
          <button
            ref={confirmarRef}
            type="button"
            onClick={onConfirmar}
            className={`flex-1 font-semibold py-3 rounded-xl text-white ${
              perigoso ? 'bg-red-500 hover:bg-red-600' : onCancelar ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-brand hover:bg-brand/90'
            }`}
          >
            {confirmarLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal Nova Comanda ───────────────────────────────────────────────────────

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
            <button type="button" onClick={onClose}
              className="flex-1 border border-slate-300 text-slate-700 font-semibold py-3 rounded-xl">
              Cancelar
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 bg-brand text-white font-semibold py-3 rounded-xl disabled:opacity-50">
              {loading ? 'Criando…' : 'Abrir'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

function Sidebar({ comandaAtualId, onNovaComanda }) {
  const [comandas, setComandas] = useState([])
  const navigate = useNavigate()

  const carregar = useCallback(async () => {
    try {
      const data = await ops.listarComandas()
      setComandas(data)
    } catch {}
  }, [])

  useEffect(() => {
    carregar()
    const interval = setInterval(carregar, 15000)
    return () => clearInterval(interval)
  }, [carregar])

  useEffect(() => { carregar() }, [comandaAtualId, carregar])

  return (
    <aside className="w-56 bg-white border-r border-slate-200 flex flex-col flex-shrink-0 overflow-hidden">
      <div className="p-3 border-b border-slate-100">
        <button
          onClick={onNovaComanda}
          className="w-full bg-brand text-white font-bold py-3 rounded-xl text-base flex items-center justify-center gap-1 active:scale-95 transition-transform"
        >
          + Nova Comanda
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {comandas.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-4">Nenhuma aberta</p>
        ) : (
          comandas.map((c) => (
            <button
              key={c.id}
              onClick={() => navigate(`/comanda/${c.id}`)}
              className={`w-full text-left px-3 py-2.5 rounded-xl transition-colors border ${
                c.id === Number(comandaAtualId)
                  ? 'bg-brand/10 text-brand font-semibold border-brand/20'
                  : 'hover:bg-slate-50 text-slate-700 border-transparent'
              }`}
            >
              <div className="font-medium truncate text-base">{nomeComanda(c)}</div>
              <div className="text-sm text-slate-400 flex justify-between mt-0.5">
                <span>{c.itens.length} {c.itens.length === 1 ? 'item' : 'itens'}</span>
                <span className="font-medium">{fmt(c.total)}</span>
              </div>
            </button>
          ))
        )}
      </div>

      <div className="p-3 border-t border-slate-100 space-y-0.5">
        <button onClick={() => navigate('/historico')}
          className="w-full text-left px-3 py-1.5 rounded-lg text-sm text-slate-500 hover:bg-slate-50">
          Histórico
        </button>
        <button onClick={() => navigate('/')}
          className="w-full text-left px-3 py-1.5 rounded-lg text-sm text-slate-500 hover:bg-slate-50">
          ← Voltar ao PDV
        </button>
      </div>
    </aside>
  )
}

// ─── Popup de adição de item ──────────────────────────────────────────────────
// Abre sempre (click ou Enter). Sabores/valor/qtd ficam aqui, nunca na tela principal.

function QuickAddModal({ cat, rawCats, comanda, onAdicionado, onClose }) {
  const isKilo      = cat.tipo === 'KILO'
  const isPicole    = cat.tipo === 'PICOLE'
  const isOutros    = cat.tipo === 'OUTROS'
  const isTaca      = cat.tipo === 'TACA'
  const isCasquinha = cat.tipo === 'CASQUINHA'
  const temProdutos = (cat.produtos?.length || 0) > 0

  const [prodIdx, setProdIdx]           = useState(0)
  const [quantidade, setQuantidade]     = useState(1)
  const [valor, setValor]               = useState('')
  const [descricao, setDescricao]       = useState('')
  const [loading, setLoading]           = useState(false)
  const [erro, setErro]                 = useState('')

  const valorRef   = useRef(null)
  const descRef    = useRef(null)
  const qtdRef     = useRef(null)
  const prodRefs   = useRef([])
  const handleConfirmarRef = useRef(null)

  const produtoSelecionado = temProdutos ? (cat.produtos[prodIdx] || null) : null
  const picoleExistentes   = isPicole ? contarPicolesMesmoPool(comanda.itens, rawCats, cat) : 0

  const precoUnitario = useMemo(() => {
    if (isKilo || isOutros) {
      const v = parseFloat(valor.replace(',', '.'))
      return v > 0 ? v : null
    }
    if (isPicole) return resolverFaixaPreco(cat.precosPorQuantidade, picoleExistentes + quantidade)
    if (temProdutos && produtoSelecionado) {
      if (produtoSelecionado.preco) return Number(produtoSelecionado.preco)
      return resolverFaixaPreco(cat.precosPorQuantidade, 1)
    }
    return resolverFaixaPreco(cat.precosPorQuantidade, 1)
  }, [isKilo, isOutros, isPicole, temProdutos, valor, quantidade, picoleExistentes, produtoSelecionado, cat])

  const totalItem = precoUnitario !== null
    ? (isKilo || isOutros ? precoUnitario : precoUnitario * quantidade)
    : null

  // Auto-focus por tipo
  useEffect(() => {
    const t = setTimeout(() => {
      if (isKilo) valorRef.current?.focus()
      else if (isOutros) descRef.current?.focus()
      else if (isPicole) qtdRef.current?.focus()
      // para categorias com produtos, ↑↓ navega sem foco DOM
    }, 30)
    return () => clearTimeout(t)
  }, [isKilo, isOutros, isPicole])

  // Scroll do produto selecionado para view
  useEffect(() => {
    prodRefs.current[prodIdx]?.scrollIntoView({ block: 'nearest' })
  }, [prodIdx])

  async function handleConfirmar() {
    setErro('')

    if (isKilo) {
      const v = parseFloat(valor.replace(',', '.'))
      if (!v || v <= 0) { setErro('Informe o valor'); return }
      setLoading(true)
      try { await onAdicionado({ tipo: 'KILO', descricao: cat.nome, quantidade: 1, valorUnitario: v, categoriaId: cat.id }); onClose() }
      catch (e) { setErro(e.response?.data?.error || 'Erro ao adicionar') }
      finally { setLoading(false) }
      return
    }

    if (isOutros) {
      const v = parseFloat(valor.replace(',', '.'))
      if (!v || v <= 0) { setErro('Informe o valor'); return }
      setLoading(true)
      try { await onAdicionado({ tipo: 'OUTROS', descricao: descricao.trim() || 'Outros', quantidade: 1, valorUnitario: v }); onClose() }
      catch (e) { setErro(e.response?.data?.error || 'Erro ao adicionar') }
      finally { setLoading(false) }
      return
    }

    if (isPicole) {
      const pu = resolverFaixaPreco(cat.precosPorQuantidade, picoleExistentes + quantidade)
      if (!pu) { setErro('Preço não encontrado'); return }
      const payload = buildPicolePayload(cat, rawCats, comanda, quantidade, pu)
      setLoading(true)
      try { await onAdicionado(payload); onClose() }
      catch (e) { setErro(e.response?.data?.error || 'Erro ao adicionar') }
      finally { setLoading(false) }
      return
    }

    if (temProdutos) {
      if (!produtoSelecionado) { setErro('Selecione um sabor'); return }
      const pu = produtoSelecionado.preco
        ? Number(produtoSelecionado.preco)
        : resolverFaixaPreco(cat.precosPorQuantidade, 1)
      if (!pu) { setErro('Preço não encontrado'); return }
      let desc = produtoSelecionado.nome
      if (isTaca && descricao.trim()) desc = `${produtoSelecionado.nome} - ${descricao.trim()}`
      setLoading(true)
      try { await onAdicionado({ tipo: tipoBackendFromCat(cat), descricao: desc, quantidade, valorUnitario: pu, categoriaId: cat.id }); onClose() }
      catch (e) { setErro(e.response?.data?.error || 'Erro ao adicionar') }
      finally { setLoading(false) }
      return
    }

    const pu = resolverFaixaPreco(cat.precosPorQuantidade, 1)
    if (!pu) { setErro('Preço não encontrado'); return }
    setLoading(true)
    try { await onAdicionado({ tipo: tipoBackendFromCat(cat), descricao: cat.nome, quantidade: 1, valorUnitario: pu, categoriaId: cat.id }); onClose() }
    catch (e) { setErro(e.response?.data?.error || 'Erro ao adicionar') }
    finally { setLoading(false) }
  }

  useEffect(() => { handleConfirmarRef.current = handleConfirmar })

  // Teclado: Esc fecha, ↑↓ navega lista de produtos, Enter confirma
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') { onClose(); return }
      const tag = document.activeElement?.tagName?.toLowerCase()
      const isInput = ['input', 'textarea', 'select'].includes(tag)
      if (temProdutos && !isInput) {
        if (e.key === 'ArrowDown') { e.preventDefault(); setProdIdx((i) => Math.min((cat.produtos?.length || 1) - 1, i + 1)) }
        if (e.key === 'ArrowUp')   { e.preventDefault(); setProdIdx((i) => Math.max(0, i - 1)) }
      }
      if (e.key === 'Enter' && !isInput) { e.preventDefault(); handleConfirmarRef.current?.() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, temProdutos, cat])

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">{cat.emoji} {cat.nome}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none px-1">×</button>
        </div>

        <div className="p-5 space-y-4">
          {/* KILO: valor */}
          {isKilo && (
            <div>
              <label className="text-sm text-slate-500 mb-1.5 block font-medium">Valor total cobrado (R$)</label>
              <input
                ref={valorRef}
                type="number" inputMode="decimal"
                value={valor} onChange={(e) => setValor(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleConfirmarRef.current?.() } }}
                placeholder="Ex: 25,50" min="0.01" step="0.01"
                className="w-full border border-slate-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
          )}

          {/* OUTROS: descrição + valor */}
          {isOutros && (
            <>
              <div>
                <label className="text-sm text-slate-500 mb-1.5 block font-medium">Descrição</label>
                <input
                  ref={descRef}
                  type="text"
                  value={descricao} onChange={(e) => setDescricao(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); valorRef.current?.focus() } }}
                  placeholder="Ex: Chiclete, Bolinha, Bombom…"
                  className="w-full border border-slate-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>
              <div>
                <label className="text-sm text-slate-500 mb-1.5 block font-medium">Valor (R$)</label>
                <input
                  ref={valorRef}
                  type="number" inputMode="decimal"
                  value={valor} onChange={(e) => setValor(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleConfirmarRef.current?.() } }}
                  placeholder="Ex: 1,50" min="0.01" step="0.01"
                  className="w-full border border-slate-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>
            </>
          )}

          {/* PICOLE: quantidade */}
          {isPicole && (
            <>
              <div className="flex items-center justify-between gap-4">
                <label className="text-base text-slate-600 font-medium">Quantidade:</label>
                <input
                  ref={qtdRef}
                  type="number" inputMode="numeric" min="1"
                  value={quantidade}
                  onChange={(e) => setQuantidade(Math.max(1, parseInt(e.target.value) || 1))}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleConfirmarRef.current?.() } }}
                  className="w-24 border border-slate-300 rounded-xl px-3 py-2.5 text-center text-xl font-bold focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>
              {cat.precosPorQuantidade?.length > 0 && (
                <div className="bg-blue-50 rounded-xl px-4 py-3 text-sm text-blue-700 space-y-1">
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {cat.precosPorQuantidade.map((f, i) => {
                      const ativo = resolverFaixaPreco(cat.precosPorQuantidade, picoleExistentes + quantidade) === Number(f.preco)
                      return (
                        <span key={i} className={`font-semibold ${ativo ? 'text-brand text-base' : 'opacity-50'}`}>
                          {f.quantidadeMinima}+: {fmt(f.preco)}
                        </span>
                      )
                    })}
                  </div>
                  {picoleExistentes > 0 && (
                    <p className="opacity-60 text-xs">{picoleExistentes} já na comanda · total: {picoleExistentes + quantidade}</p>
                  )}
                </div>
              )}
            </>
          )}

          {/* Produtos (POTE / CASQUINHA / TACA / BEBIDA) — obrigatório selecionar */}
          {temProdutos && !isKilo && !isPicole && (
            <div className="space-y-1 max-h-56 overflow-y-auto">
              {cat.produtos.map((p, i) => (
                <button
                  key={p.id}
                  ref={(el) => { prodRefs.current[i] = el }}
                  type="button"
                  onClick={() => setProdIdx(i)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl border transition-colors flex items-center justify-between ${
                    i === prodIdx
                      ? 'bg-brand text-white border-brand'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-brand/10'
                  }`}
                >
                  <span className="font-medium">{p.nome}</span>
                  {p.preco && <span className="text-sm opacity-70">{fmt(p.preco)}</span>}
                </button>
              ))}
              <p className="text-xs text-slate-400 text-center pt-1">↑ ↓ para navegar</p>
            </div>
          )}

          {/* Quantidade (POTE / TACA / BEBIDA / CASQUINHA) */}
          {temProdutos && !isKilo && !isPicole && (
            <div className="flex items-center justify-between gap-4">
              <label className="text-base text-slate-600 font-medium">Quantidade:</label>
              <input
                type="number" inputMode="numeric" min="1"
                value={quantidade}
                onChange={(e) => setQuantidade(Math.max(1, parseInt(e.target.value) || 1))}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleConfirmarRef.current?.() } }}
                className="w-24 border border-slate-300 rounded-xl px-3 py-2.5 text-center text-xl font-bold focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
          )}

          {/* TACA: descrição opcional */}
          {isTaca && (
            <div>
              <label className="text-sm text-slate-500 mb-1.5 block font-medium">Descrição (opcional)</label>
              <input
                type="text"
                value={descricao} onChange={(e) => setDescricao(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleConfirmarRef.current?.() } }}
                placeholder={produtoSelecionado?.nome ? `${produtoSelecionado.nome} - obs…` : 'Observação…'}
                className="w-full border border-slate-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
          )}

          {/* Preview de preço */}
          {totalItem !== null && (
            <p className="text-base bg-slate-50 rounded-xl px-4 py-3 text-slate-700">
              Total: <span className="font-bold text-brand text-lg">{fmt(totalItem)}</span>
              {!isKilo && !isOutros && precoUnitario !== null && quantidade > 1 && (
                <span className="text-slate-400 text-sm ml-2">({fmt(precoUnitario)} × {quantidade})</span>
              )}
            </p>
          )}

          {erro && <p className="text-red-600 text-sm">{erro}</p>}
        </div>

        <div className="px-5 pb-5 flex gap-3">
          <button type="button" onClick={onClose}
            className="flex-1 border border-slate-300 text-slate-700 font-semibold py-3 rounded-xl">
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => handleConfirmarRef.current?.()}
            disabled={loading}
            className="flex-1 bg-brand text-white font-semibold py-3 rounded-xl disabled:opacity-50"
          >
            {loading ? 'Adicionando…' : '+ Adicionar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Formulário de itens — só as chips de categoria ───────────────────────────

function AdicionarItemForm({ comanda, onAdicionado, bloqueado }) {
  const [rawCats, setRawCats]           = useState([])
  const [catId, setCatId]               = useState(null)
  const [carregando, setCarregando]     = useState(true)
  const [showQuickAdd, setShowQuickAdd] = useState(false)

  const allCatsRef = useRef([])
  const catIdRef   = useRef(null)

  useEffect(() => {
    ops.carregarCardapio().then((data) => {
      const cats = (data.categorias || []).slice().sort((a, b) => {
        if (a.tipo === 'KILO') return -1
        if (b.tipo === 'KILO') return 1
        return 0
      })
      setRawCats(cats)
      if (cats.length > 0) setCatId(cats[0].id)
    }).catch(() => {}).finally(() => setCarregando(false))
  }, [])

  const allCats = useMemo(() => [...rawCats, OUTROS_CAT], [rawCats])
  const cat     = allCats.find((c) => c.id === catId) || null

  useEffect(() => { allCatsRef.current = allCats }, [allCats])
  useEffect(() => { catIdRef.current   = catId   }, [catId])

  // Teclado: ← → categorias, Enter abre popup
  useEffect(() => {
    if (showQuickAdd) return
    function handler(e) {
      const tag = document.activeElement?.tagName?.toLowerCase()
      if (['input', 'textarea', 'select'].includes(tag)) return
      const cats = allCatsRef.current
      const idx  = cats.findIndex((x) => x.id === catIdRef.current)
      if (idx < 0) return
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        const dir = e.key === 'ArrowLeft' ? -1 : 1
        setCatId(cats[(idx + dir + cats.length) % cats.length].id)
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault()
        const dir = e.key === 'ArrowUp' ? -4 : 4
        const newIdx = idx + dir
        if (newIdx >= 0 && newIdx < cats.length) setCatId(cats[newIdx].id)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        setShowQuickAdd(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [showQuickAdd])

  if (carregando) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 text-center text-slate-400">
        Carregando produtos…
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-slate-700 text-lg">Adicionar item</h3>
        <span className="text-xs text-slate-400 hidden sm:block">← → ↑ ↓ categorias &nbsp;·&nbsp; Enter adicionar</span>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {allCats.map((c) => (
          <button
            key={c.id}
            type="button"
            disabled={bloqueado}
            onClick={() => { setCatId(c.id); setShowQuickAdd(true) }}
            className={`px-3 py-2 rounded-xl text-base font-semibold border transition-colors disabled:opacity-40 ${
              catId === c.id
                ? 'bg-brand text-white border-brand'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            {c.emoji} {c.nome}
          </button>
        ))}
      </div>

      {showQuickAdd && cat && !bloqueado && (
        <QuickAddModal
          cat={cat}
          rawCats={rawCats}
          comanda={comanda}
          onAdicionado={onAdicionado}
          onClose={() => setShowQuickAdd(false)}
        />
      )}
    </div>
  )
}

// ─── Modal editar nome do cliente ────────────────────────────────────────────

function EditarNomeModal({ nomeAtual, onClose, onSalvar }) {
  const [nome, setNome] = useState(nomeAtual === '—' ? '' : nomeAtual)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setErro('')
    setLoading(true)
    try {
      await onSalvar(nome.trim() || '—')
      onClose()
    } catch (err) {
      setErro(err.response?.data?.error || 'Erro ao salvar')
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-xl font-bold text-slate-800 mb-4">Editar nome do cliente</h2>
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
            <button type="button" onClick={onClose}
              className="flex-1 border border-slate-300 text-slate-700 font-semibold py-3 rounded-xl">
              Cancelar
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 bg-brand text-white font-semibold py-3 rounded-xl disabled:opacity-50">
              {loading ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Modal de forma de pagamento ─────────────────────────────────────────────

const PAGAMENTOS = [
  { value: 'DINHEIRO', label: 'Dinheiro', icon: '💵' },
  { value: 'MAQUINA',  label: 'Cartão',   icon: '💳' },
  { value: 'PIX',      label: 'Pix',      icon: '📱' },
  { value: 'NOTINHA',  label: 'Notinha',  icon: '📝' },
]

function PagamentoModal({ total, onClose, onConfirmar }) {
  // pagamentosFeitos: [{forma, valor}]
  const [pagamentosFeitos, setPagamentosFeitos] = useState([])
  const [parcialAtivo, setParcialAtivo]         = useState(false)
  const [valorParcial, setValorParcial]         = useState('')
  const [step, setStep]                         = useState('escolha') // 'escolha' | 'troco' | 'notinha'
  const [valorRecebido, setValorRecebido]       = useState('')
  const [nomeCliente, setNomeCliente]           = useState('')
  const trocoInputRef  = useRef(null)
  const nomeInputRef   = useRef(null)
  const parcialRef     = useRef(null)

  const totalPago     = pagamentosFeitos.reduce((s, p) => s + p.valor, 0)
  const totalRestante = Math.max(0, total - totalPago)
  const valorParcialNum = parseFloat(valorParcial.replace(',', '.')) || 0

  useEffect(() => {
    if (step === 'troco')   setTimeout(() => trocoInputRef.current?.focus(), 30)
    if (step === 'notinha') setTimeout(() => nomeInputRef.current?.focus(), 30)
  }, [step])

  useEffect(() => {
    if (parcialAtivo) setTimeout(() => parcialRef.current?.focus(), 30)
  }, [parcialAtivo])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') {
        if (step !== 'escolha') { setStep('escolha'); return }
        if (parcialAtivo) { setParcialAtivo(false); setValorParcial(''); return }
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, step, parcialAtivo])

  function registrarParcial(forma) {
    if (valorParcialNum <= 0 || valorParcialNum > totalRestante + 0.001) return
    const valor = Math.min(valorParcialNum, totalRestante)
    const novos = [...pagamentosFeitos, { forma, valor: Number(valor.toFixed(2)) }]
    setPagamentosFeitos(novos)
    setParcialAtivo(false)
    setValorParcial('')
    const novoRestante = Math.max(0, totalRestante - valor)
    if (novoRestante < 0.01) {
      onConfirmar(novos)
    }
  }

  function handleEscolha(tipo) {
    if (parcialAtivo) {
      registrarParcial(tipo)
      return
    }
    if (tipo === 'DINHEIRO') setStep('troco')
    else if (tipo === 'NOTINHA') setStep('notinha')
    else {
      const allPays = [...pagamentosFeitos, { forma: tipo, valor: Number(totalRestante.toFixed(2)) }]
      onConfirmar(allPays)
    }
  }

  const containerClass = "fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50"
  const cardClass = "bg-white rounded-t-3xl sm:rounded-3xl shadow-xl w-full sm:max-w-sm p-6"

  // ── Tela de troco ──────────────────────────────────────────────────────────
  if (step === 'troco') {
    const valorNum = parseFloat(valorRecebido.replace(',', '.')) || 0
    const troco = valorNum > 0 ? valorNum - totalRestante : null
    const trocoInsuficiente = valorNum > 0 && valorNum < totalRestante
    function confirmarDinheiro() {
      const allPays = [...pagamentosFeitos, { forma: 'DINHEIRO', valor: Number(totalRestante.toFixed(2)) }]
      onConfirmar(allPays)
    }
    return (
      <div className={containerClass} onClick={onClose}>
        <div className={cardClass} onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => setStep('escolha')} className="text-slate-400 hover:text-slate-600 text-sm font-medium">
              ← Voltar
            </button>
            <h2 className="text-xl font-bold text-slate-800">💵 Dinheiro</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">×</button>
          </div>
          <p className="text-slate-500 text-sm mb-4">
            {pagamentosFeitos.length > 0 ? 'Restante' : 'Total'}: <span className="font-bold text-slate-700 text-base">{fmt(totalRestante)}</span>
          </p>
          <div className="mb-4">
            <label className="text-sm font-medium text-slate-600 mb-2 block">Valor recebido (R$)</label>
            <input
              ref={trocoInputRef}
              type="number" inputMode="decimal"
              value={valorRecebido} onChange={(e) => setValorRecebido(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') confirmarDinheiro() }}
              placeholder="0,00" min="0" step="0.01"
              className="w-full border border-slate-300 rounded-xl px-4 py-3 text-lg font-bold focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          {trocoInsuficiente && (
            <p className="text-red-500 text-sm font-medium mb-4">⚠️ Valor insuficiente</p>
          )}
          {troco !== null && !trocoInsuficiente && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-4 flex items-center justify-between">
              <span className="text-emerald-700 font-semibold">Troco:</span>
              <span className="text-emerald-700 font-bold text-2xl">{fmt(troco)}</span>
            </div>
          )}
          <button
            type="button"
            onClick={confirmarDinheiro}
            className="w-full bg-emerald-500 text-white font-bold py-4 rounded-2xl text-lg active:scale-95 transition-transform"
          >
            Finalizar
          </button>
        </div>
      </div>
    )
  }

  // ── Tela de notinha ────────────────────────────────────────────────────────
  if (step === 'notinha') {
    function confirmarNotinha() {
      const allPays = [...pagamentosFeitos, { forma: 'NOTINHA', valor: Number(totalRestante.toFixed(2)) }]
      onConfirmar(allPays)
    }
    return (
      <div className={containerClass} onClick={onClose}>
        <div className={cardClass} onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => setStep('escolha')} className="text-slate-400 hover:text-slate-600 text-sm font-medium">
              ← Voltar
            </button>
            <h2 className="text-xl font-bold text-slate-800">📝 Notinha</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">×</button>
          </div>
          <p className="text-slate-500 text-sm mb-1">
            {pagamentosFeitos.length > 0 ? 'Restante' : 'Total'}: <span className="font-bold text-slate-700 text-base">{fmt(totalRestante)}</span>
          </p>
          <p className="text-xs text-slate-400 mb-4">Não entra no caixa · registre o nome para a notinha física</p>
          <div className="mb-6">
            <label className="text-sm font-medium text-slate-600 mb-2 block">Nome do cliente (opcional)</label>
            <input
              ref={nomeInputRef}
              type="text"
              value={nomeCliente} onChange={(e) => setNomeCliente(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') confirmarNotinha() }}
              placeholder="Nome do cliente…"
              className="w-full border border-slate-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <button
            type="button"
            onClick={confirmarNotinha}
            className="w-full bg-brand text-white font-bold py-4 rounded-2xl text-lg active:scale-95 transition-transform"
          >
            Finalizar
          </button>
        </div>
      </div>
    )
  }

  // ── Tela de escolha ────────────────────────────────────────────────────────
  const parcialInvalido = parcialAtivo && (valorParcialNum <= 0 || valorParcialNum > totalRestante + 0.001)

  return (
    <div className={containerClass} onClick={onClose}>
      <div className={cardClass} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-xl font-bold text-slate-800">Forma de pagamento</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none px-1">×</button>
        </div>

        {/* Pagamentos já feitos */}
        {pagamentosFeitos.length > 0 && (
          <div className="mt-2 mb-3 space-y-1">
            {pagamentosFeitos.map((pg, i) => {
              const info = PAGAMENTOS.find((p) => p.value === pg.forma)
              return (
                <div key={i} className="flex items-center justify-between text-sm bg-slate-50 rounded-xl px-3 py-2">
                  <span className="text-slate-600">{info?.icon} {info?.label ?? pg.forma}</span>
                  <span className="font-semibold text-emerald-600">{fmt(pg.valor)}</span>
                </div>
              )
            })}
            <div className="flex items-center justify-between text-sm px-3 pt-1">
              <span className="font-semibold text-slate-700">Restante</span>
              <span className="font-bold text-brand text-base">{fmt(totalRestante)}</span>
            </div>
          </div>
        )}

        {pagamentosFeitos.length === 0 && (
          <p className="text-slate-400 text-sm mb-3">
            Total: <span className="font-bold text-slate-700">{fmt(total)}</span>
          </p>
        )}

        {/* Checkbox pag. parcial */}
        <label className="flex items-center gap-2 mb-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={parcialAtivo}
            onChange={(e) => {
              setParcialAtivo(e.target.checked)
              if (!e.target.checked) setValorParcial('')
            }}
            className="w-4 h-4 accent-brand rounded"
          />
          <span className="text-sm font-medium text-slate-600">Pag. parcial</span>
        </label>

        {/* Campo de valor parcial */}
        {parcialAtivo && (
          <div className="mb-3">
            <input
              ref={parcialRef}
              type="number" inputMode="decimal"
              value={valorParcial}
              onChange={(e) => setValorParcial(e.target.value)}
              placeholder="Valor parcial (R$)"
              min="0.01" step="0.01"
              className={`w-full border rounded-xl px-4 py-3 text-lg font-bold focus:outline-none focus:ring-2 ${
                parcialInvalido ? 'border-red-300 focus:ring-red-400' : 'border-slate-300 focus:ring-brand'
              }`}
            />
            {parcialInvalido && valorParcial !== '' && (
              <p className="text-red-500 text-xs mt-1">Valor deve ser entre R$ 0,01 e {fmt(totalRestante)}</p>
            )}
          </div>
        )}

        <div className="space-y-3">
          {PAGAMENTOS.map((p) => (
            <button
              key={p.value}
              onClick={() => !parcialInvalido && handleEscolha(p.value)}
              disabled={parcialAtivo && parcialInvalido}
              className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl border-2 border-slate-200 hover:border-brand hover:bg-brand/5 active:scale-95 transition-all text-left disabled:opacity-40 disabled:active:scale-100"
            >
              <span className="text-3xl">{p.icon}</span>
              <div>
                <span className="font-bold text-slate-800 text-lg block">{p.label}</span>
                {p.value === 'NOTINHA' && !parcialAtivo && (
                  <span className="text-xs text-slate-400">Não entra no caixa</span>
                )}
                {parcialAtivo && valorParcialNum > 0 && !parcialInvalido && (
                  <span className="text-xs text-slate-400">Registrar {fmt(valorParcialNum)}</span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function Comanda() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [comanda, setComanda] = useState(null)
  const [loading, setLoading] = useState(true)
  const [acao, setAcao] = useState(null)
  const [showNovaComanda, setShowNovaComanda] = useState(false)
  const [pagamentoModal, setPagamentoModal] = useState(false)
  const [modal, setModal] = useState(null)
  const [editarNome, setEditarNome] = useState(false)
  const online = useOnlineStatus()
  const bloqueado = !isPrincipal() && !online

  const carregar = useCallback(async () => {
    try {
      const data = await ops.carregarComanda(id)
      setComanda(data)
    } catch {
      navigate('/', { replace: true })
    } finally {
      setLoading(false)
    }
  }, [id, navigate])

  useEffect(() => {
    setAcao(null)
    setModal(null)
    setPagamentoModal(false)
    setComanda(null)
    setLoading(true)
  }, [id])

  useEffect(() => { carregar() }, [carregar])

  async function adicionarItem(item) {
    const data = await ops.adicionarItem(id, item)
    setComanda(data)
  }

  function removerItem(itemId) {
    setModal({
      mensagem: 'Remover este item?',
      confirmarLabel: 'Remover',
      cancelarLabel: 'Cancelar',
      perigoso: true,
      onCancelar: () => setModal(null),
      onConfirmar: async () => {
        setModal(null)
        try {
          const data = await ops.removerItem(id, itemId)
          setComanda(data)
        } catch (err) {
          setModal({
            mensagem: err.response?.data?.error || 'Erro ao remover item',
            confirmarLabel: 'OK',
            onConfirmar: () => setModal(null),
          })
        }
      },
    })
  }

  async function navegarProximaComanda() {
    try {
      const abertas = await ops.listarComandas()
      if (abertas.length > 0) {
        navigate(`/comanda/${abertas[0].id}`, { replace: true })
      } else {
        const nova = await ops.criarComanda()
        navigate(`/comanda/${nova.id}`, { replace: true })
      }
    } catch {
      navigate('/', { replace: true })
    }
  }

  async function finalizar(pagamentos) {
    setPagamentoModal(false)
    setAcao('finalizando')
    const formaPagamento = pagamentos[pagamentos.length - 1].forma
    try {
      await ops.finalizarComanda(id, { formaPagamento, pagamentos })
      await navegarProximaComanda()
    } catch (err) {
      setAcao(null)
      setModal({
        mensagem: err.response?.data?.error || 'Erro ao finalizar',
        confirmarLabel: 'OK',
        onConfirmar: () => setModal(null),
      })
    }
  }

  function cancelar() {
    const nome = nomeComanda(comanda)
    setModal({
      mensagem: `Cancelar comanda ${nome}?\nEsta ação não pode ser desfeita.`,
      confirmarLabel: 'Cancelar comanda',
      cancelarLabel: 'Voltar',
      perigoso: true,
      onCancelar: () => setModal(null),
      onConfirmar: async () => {
        setModal(null)
        setAcao('cancelando')
        try {
          await ops.cancelarComanda(id)
          await navegarProximaComanda()
        } catch (err) {
          setAcao(null)
          setModal({
            mensagem: err.response?.data?.error || 'Erro ao cancelar',
            confirmarLabel: 'OK',
            onConfirmar: () => setModal(null),
          })
        }
      },
    })
  }

  async function salvarNome(novoNome) {
    const data = await ops.salvarNome(id, novoNome)
    setComanda(data)
  }

  function handleCriada(novaComanda) {
    setShowNovaComanda(false)
    navigate(`/comanda/${novaComanda.id}`)
  }

  if (loading) {
    return <div className="h-screen flex items-center justify-center text-slate-400 text-lg">Carregando…</div>
  }

  if (!comanda) return null

  const isAberta = comanda.status === 'ABERTO'

  return (
    <div className="h-screen bg-slate-100 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="bg-brand text-white px-4 py-3 flex items-center gap-3 shadow-md flex-shrink-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <p className="font-bold text-xl leading-tight truncate">{nomeComanda(comanda)}</p>
            {isAberta && (
              <button
                onClick={() => setEditarNome(true)}
                className="text-blue-200 hover:text-white shrink-0 leading-none text-lg"
                title="Editar nome"
              >✎</button>
            )}
          </div>
          <p className="text-sm text-blue-200">Comanda #{comanda.id}</p>
        </div>
        <div className="shrink-0"><SyncStatusBadge /></div>
        <div className="text-right shrink-0">
          <p className="font-bold text-2xl">{fmt(comanda.total)}</p>
          <p className="text-sm text-blue-200">
            {comanda.itens.length} {comanda.itens.length === 1 ? 'item' : 'itens'}
          </p>
        </div>
      </header>
      {bloqueado && (
        <div className="bg-slate-800 text-white text-sm font-semibold text-center py-2 flex-shrink-0">
          🔒 Sem conexão — use o computador principal para novas ações
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <Sidebar comandaAtualId={id} onNovaComanda={() => setShowNovaComanda(true)} />

        <main className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Badge de status */}
          {!isAberta && (
            <div className={`text-center font-bold py-2.5 rounded-xl text-base ${
              comanda.status === 'FINALIZADO'
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-gray-100 text-gray-500'
            }`}>
              {comanda.status}
            </div>
          )}

          {/* Formulário de adicionar */}
          {isAberta && <AdicionarItemForm comanda={comanda} onAdicionado={adicionarItem} bloqueado={bloqueado} />}

          {/* Total + lista de itens */}
          <div className="space-y-0">
            <div className="bg-slate-800 text-white px-4 py-3 rounded-t-2xl flex items-center justify-between">
              <span className="text-slate-300 text-sm">
                {comanda.itens.length} {comanda.itens.length === 1 ? 'item' : 'itens'}
              </span>
              <span className="font-bold text-xl">{fmt(comanda.total)}</span>
            </div>

            <div className="bg-white rounded-b-2xl shadow-sm border border-t-0 border-slate-200 divide-y divide-slate-100">
              {comanda.itens.length === 0 ? (
                <p className="text-center text-slate-400 py-8 text-base">Nenhum item ainda</p>
              ) : (
                comanda.itens.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-800 text-base truncate">{item.descricao}</p>
                      <p className="text-sm text-slate-500">
                        {tipoLabel(item.tipo)} · {displayQtd(item)}
                        {item.tipo !== 'KILO' && item.tipo !== 'KILO_BOLO' && item.tipo !== 'OUTROS'
                          ? ` × ${fmt(item.valorUnitario)}`
                          : ''}
                      </p>
                    </div>
                    <span className="font-bold text-slate-700 shrink-0 text-base">{fmt(item.valorTotal)}</span>
                    {isAberta && (
                      <button
                        onClick={() => removerItem(item.id)}
                        className="text-red-400 hover:text-red-600 text-2xl leading-none shrink-0 px-1"
                      >×</button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Ações */}
          {isAberta && (
            <div className="grid grid-cols-2 gap-3 pb-8">
              <button
                onClick={cancelar}
                disabled={!!acao || bloqueado}
                className="border-2 border-red-300 text-red-600 font-bold py-4 rounded-2xl text-base disabled:opacity-50 active:scale-95 transition-transform"
              >
                {acao === 'cancelando' ? 'Cancelando…' : 'Cancelar'}
              </button>
              <button
                onClick={() => setPagamentoModal(true)}
                disabled={!!acao || comanda.itens.length === 0 || bloqueado}
                className="bg-emerald-500 text-white font-bold py-4 rounded-2xl text-base disabled:opacity-50 active:scale-95 transition-transform shadow-md"
              >
                {acao === 'finalizando' ? 'Finalizando…' : 'Finalizar'}
              </button>
            </div>
          )}
        </main>
      </div>

      {/* Modais */}
      {modal && (
        <Modal
          mensagem={modal.mensagem}
          onConfirmar={modal.onConfirmar}
          onCancelar={modal.onCancelar}
          confirmarLabel={modal.confirmarLabel}
          cancelarLabel={modal.cancelarLabel}
          perigoso={modal.perigoso}
        />
      )}
      {pagamentoModal && (
        <PagamentoModal
          total={comanda.total}
          onClose={() => setPagamentoModal(false)}
          onConfirmar={finalizar}
        />
      )}
      {showNovaComanda && (
        <NovaComandaModal onClose={() => setShowNovaComanda(false)} onCreate={handleCriada} />
      )}
      {editarNome && (
        <EditarNomeModal
          nomeAtual={comanda.clienteNome}
          onClose={() => setEditarNome(false)}
          onSalvar={salvarNome}
        />
      )}
    </div>
  )
}
