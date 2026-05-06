import { useState, useEffect } from 'react'
import api from '../lib/api'
import Modal from '../components/Modal'

const fmt = (v) => 'R$ ' + Number(v).toFixed(2).replace('.', ',')

const TIPO_LABEL = { POTE: 'Pote', PICOLE: 'Picolé', BEBIDA: 'Bebida', KILO: 'Kg' }
const TIPO_CLS = {
  POTE:   'bg-blue-100 text-blue-700',
  PICOLE: 'bg-pink-100 text-pink-700',
  BEBIDA: 'bg-green-100 text-green-700',
  KILO:   'bg-orange-100 text-orange-700',
}

const INITIAL_CAT = { nome: '', tipo: 'POTE', preco: '', precoKilo: '' }
const INITIAL_PROD = { nome: '', ordem: 0 }

export default function Cardapio() {
  const [cats, setCats] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  // modals
  const [catModal, setCatModal] = useState(null)     // null | { mode:'add'|'edit', data }
  const [prodModal, setProdModal] = useState(null)   // null | { mode:'add'|'edit', catId, catTipo, data }
  const [precoModal, setPrecoModal] = useState(null) // null | { cat }
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    try {
      setLoading(true)
      const { data } = await api.get('/api/admin/categorias')
      setCats(data)
    } catch {
      setErr('Erro ao carregar cardápio')
    } finally {
      setLoading(false)
    }
  }

  async function toggleCat(cat) {
    const prev = cats
    setCats(cs => cs.map(c => c.id === cat.id ? { ...c, ativo: !c.ativo } : c))
    try {
      await api.patch(`/api/admin/categorias/${cat.id}`, { ativo: !cat.ativo })
    } catch {
      setCats(prev)
    }
  }

  async function toggleProd(catId, prod) {
    const prev = cats
    setCats(cs => cs.map(c =>
      c.id === catId
        ? { ...c, produtos: c.produtos.map(p => p.id === prod.id ? { ...p, disponivel: !p.disponivel } : p) }
        : c
    ))
    try {
      await api.patch(`/api/admin/produtos/${prod.id}`, { disponivel: !prod.disponivel })
    } catch {
      setCats(prev)
    }
  }

  async function deleteProd(catId, prodId) {
    if (!confirm('Excluir produto?')) return
    const prev = cats
    setCats(cs => cs.map(c =>
      c.id === catId ? { ...c, produtos: c.produtos.filter(p => p.id !== prodId) } : c
    ))
    try {
      await api.delete(`/api/admin/produtos/${prodId}`)
    } catch {
      setCats(prev)
      alert('Erro ao excluir produto')
    }
  }

  // ── Save category ────────────────────────────────────────────
  async function saveCat(formData) {
    setSaving(true)
    try {
      if (catModal.mode === 'add') {
        const catPayload = { nome: formData.nome, tipo: formData.tipo, ordem: parseInt(formData.ordem) || 0 }
        if (formData.tipo === 'KILO' && formData.precoKilo) {
          catPayload.precoKilo = parseFloat(formData.precoKilo)
        }
        const { data } = await api.post('/api/admin/categorias', catPayload)
        const newCat = { ...data, produtos: [], precosPorQuantidade: [] }
        if (formData.preco && (formData.tipo === 'POTE' || formData.tipo === 'BEBIDA')) {
          await api.put(`/api/admin/categorias/${data.id}/precos`, [
            { quantidadeMinima: 1, preco: parseFloat(formData.preco) },
          ])
          newCat.precosPorQuantidade = [{ quantidadeMinima: 1, preco: parseFloat(formData.preco) }]
        }
        setCats(cs => [...cs, newCat])
      } else {
        const tipo = catModal.data.tipo
        const updatePayload = { nome: formData.nome, ordem: parseInt(formData.ordem) || 0 }
        if (tipo === 'KILO' && formData.precoKilo) {
          updatePayload.precoKilo = parseFloat(formData.precoKilo)
        }
        await api.patch(`/api/admin/categorias/${catModal.data.id}`, updatePayload)
        if (formData.preco && (tipo === 'POTE' || tipo === 'BEBIDA')) {
          await api.put(`/api/admin/categorias/${catModal.data.id}/precos`, [
            { quantidadeMinima: 1, preco: parseFloat(formData.preco) },
          ])
          setCats(cs => cs.map(c =>
            c.id === catModal.data.id
              ? { ...c, nome: formData.nome, ordem: parseInt(formData.ordem) || 0, precosPorQuantidade: [{ quantidadeMinima: 1, preco: parseFloat(formData.preco) }] }
              : c
          ))
        } else if (tipo === 'KILO') {
          setCats(cs => cs.map(c =>
            c.id === catModal.data.id
              ? { ...c, nome: formData.nome, ordem: parseInt(formData.ordem) || 0, precoKilo: parseFloat(formData.precoKilo) || c.precoKilo }
              : c
          ))
        } else {
          setCats(cs => cs.map(c =>
            c.id === catModal.data.id ? { ...c, nome: formData.nome, ordem: parseInt(formData.ordem) || 0 } : c
          ))
        }
      }
      setCatModal(null)
    } catch {
      alert('Erro ao salvar categoria')
    } finally {
      setSaving(false)
    }
  }

  // ── Save product ─────────────────────────────────────────────
  async function saveProd(formData) {
    setSaving(true)
    const ordem = parseInt(formData.ordem) || 0
    try {
      if (prodModal.mode === 'add') {
        const { data } = await api.post('/api/admin/produtos', {
          nome: formData.nome,
          categoriaId: prodModal.catId,
          ordem,
        })
        setCats(cs => cs.map(c =>
          c.id === prodModal.catId
            ? { ...c, produtos: [...c.produtos, { ...data, disponivel: true }].sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome)) }
            : c
        ))
      } else {
        await api.patch(`/api/admin/produtos/${prodModal.data.id}`, { nome: formData.nome, ordem })
        setCats(cs => cs.map(c =>
          c.id === prodModal.catId
            ? { ...c, produtos: c.produtos.map(p => p.id === prodModal.data.id ? { ...p, nome: formData.nome, ordem } : p).sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome)) }
            : c
        ))
      }
      setProdModal(null)
    } catch {
      alert('Erro ao salvar produto')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="text-center py-16 text-gray-400">Carregando…</div>
  if (err)     return <div className="text-center py-16 text-red-500">{err}</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Cardápio</h1>
        <button
          onClick={() => setCatModal({ mode: 'add', data: { ...INITIAL_CAT } })}
          className="bg-brand text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-brand-light transition-colors"
        >
          + Categoria
        </button>
      </div>

      <div className="space-y-4">
        {cats.map(cat => (
          <CatCard
            key={cat.id}
            cat={cat}
            onToggleCat={() => toggleCat(cat)}
            onEditCat={() => setCatModal({ mode: 'edit', data: cat })}
            onAddProd={() => setProdModal({ mode: 'add', catId: cat.id, catTipo: cat.tipo, data: { ...INITIAL_PROD } })}
            onEditProd={(prod) => setProdModal({ mode: 'edit', catId: cat.id, catTipo: cat.tipo, data: prod })}
            onToggleProd={(prod) => toggleProd(cat.id, prod)}
            onDeleteProd={(prodId) => deleteProd(cat.id, prodId)}
            onEditPrecos={() => setPrecoModal({ cat })}
          />
        ))}
        {cats.length === 0 && (
          <div className="text-center py-16 text-gray-400">Nenhuma categoria ainda</div>
        )}
      </div>

      {catModal && (
        <CatFormModal
          mode={catModal.mode}
          initial={catModal.data}
          onSave={saveCat}
          onClose={() => setCatModal(null)}
          saving={saving}
        />
      )}

      {prodModal && (
        <ProdFormModal
          mode={prodModal.mode}
          initial={prodModal.data}
          onSave={saveProd}
          onClose={() => setProdModal(null)}
          saving={saving}
        />
      )}

      {precoModal && (
        <PrecosModal
          cat={precoModal.cat}
          onClose={() => setPrecoModal(null)}
          onSaved={(tiers) => {
            setCats(cs => cs.map(c =>
              c.id === precoModal.cat.id ? { ...c, precosPorQuantidade: tiers } : c
            ))
            setPrecoModal(null)
          }}
        />
      )}
    </div>
  )
}

// ── CatCard ──────────────────────────────────────────────────────
function CatCard({ cat, onToggleCat, onEditCat, onAddProd, onEditProd, onToggleProd, onDeleteProd, onEditPrecos }) {
  const [open, setOpen] = useState(false)
  const isPicole = cat.tipo === 'PICOLE'
  const isKilo = cat.tipo === 'KILO'
  const simplePrice = !isPicole && !isKilo && cat.precosPorQuantidade?.[0]?.preco

  return (
    <div className={`bg-white rounded-xl shadow-sm border transition-opacity ${cat.ativo ? '' : 'opacity-60'}`}>
      {/* Header — clica para expandir */}
      <div
        className="flex items-center gap-2 px-4 py-3 cursor-pointer select-none"
        onClick={() => setOpen(o => !o)}
      >
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${TIPO_CLS[cat.tipo]}`}>
          {TIPO_LABEL[cat.tipo]}
        </span>

        <span className="font-semibold text-gray-800 flex-1 min-w-0 truncate">{cat.nome}</span>

        {!open && cat.produtos.length > 0 && (
          <span className="text-xs text-gray-400 flex-shrink-0">{cat.produtos.length} sabores</span>
        )}

        {simplePrice && (
          <span className="text-sm text-gray-500 flex-shrink-0">{fmt(simplePrice)}</span>
        )}

        {isKilo && cat.precoKilo && (
          <span className="text-sm text-gray-500 flex-shrink-0">{fmt(cat.precoKilo)}/kg</span>
        )}

        {isPicole && (
          <button
            onClick={e => { e.stopPropagation(); onEditPrecos() }}
            className="text-xs text-brand border border-brand/30 px-2 py-0.5 rounded hover:bg-brand/5 flex-shrink-0"
          >
            Preços
          </button>
        )}

        <button
          onClick={e => { e.stopPropagation(); onEditCat() }}
          className="text-gray-400 hover:text-gray-600 p-1 flex-shrink-0"
        >
          ✏️
        </button>

        <div onClick={e => e.stopPropagation()} className="flex-shrink-0">
          <Toggle checked={cat.ativo} onChange={onToggleCat} />
        </div>

        <span className="text-gray-400 text-xs w-3 text-center flex-shrink-0">
          {open ? '▲' : '▼'}
        </span>
      </div>

      {/* Produtos — colapsável */}
      {open && (
        <div className="border-t divide-y divide-gray-50">
          {cat.produtos.map(prod => (
            <div key={prod.id} className={`flex items-center gap-3 px-4 py-2.5 ${prod.disponivel ? '' : 'opacity-50'}`}>
              <span className="flex-1 text-sm text-gray-700">{prod.nome}</span>
              <button onClick={() => onEditProd(prod)} className="text-gray-300 hover:text-gray-500 p-1 flex-shrink-0">✏️</button>
              <button onClick={() => onDeleteProd(prod.id)} className="text-gray-300 hover:text-red-400 p-1 flex-shrink-0">🗑️</button>
              <div className="flex-shrink-0">
                <Toggle checked={prod.disponivel} onChange={() => onToggleProd(prod)} />
              </div>
            </div>
          ))}
          <div className="px-4 py-2">
            <button onClick={onAddProd} className="text-xs text-brand font-medium hover:underline">
              + Adicionar sabor
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Toggle ───────────────────────────────────────────────────────
function Toggle({ checked, onChange }) {
  return (
    <button
      onClick={onChange}
      className={`relative w-9 h-5 rounded-full transition-colors overflow-hidden ${checked ? 'bg-brand' : 'bg-gray-200'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
    </button>
  )
}

// ── CatFormModal ─────────────────────────────────────────────────
function CatFormModal({ mode, initial, onSave, onClose, saving }) {
  const [form, setForm] = useState({
    nome: initial.nome || '',
    tipo: initial.tipo || 'POTE',
    preco: initial.precosPorQuantidade?.[0]?.preco ?? '',
    precoKilo: initial.precoKilo ?? '',
    ordem: initial.ordem ?? 0,
  })

  const isEdit = mode === 'edit'
  const tipo = isEdit ? initial.tipo : form.tipo
  const needsPrice = tipo === 'POTE' || tipo === 'BEBIDA'
  const needsPrecoKilo = tipo === 'KILO'

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  return (
    <Modal
      title={isEdit ? 'Editar categoria' : 'Nova categoria'}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancelar</button>
          <button
            onClick={() => onSave(form)}
            disabled={saving || !form.nome}
            className="px-4 py-2 text-sm bg-brand text-white rounded-lg font-medium disabled:opacity-50"
          >
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Nome">
          <input
            className="input"
            value={form.nome}
            onChange={e => set('nome', e.target.value)}
            placeholder="Ex: Potes 300ml"
          />
        </Field>

        {!isEdit && (
          <Field label="Tipo">
            <select className="input" value={form.tipo} onChange={e => set('tipo', e.target.value)}>
              <option value="POTE">Pote</option>
              <option value="PICOLE">Picolé</option>
              <option value="BEBIDA">Bebida</option>
              <option value="KILO">Sorvete por Kg</option>
            </select>
          </Field>
        )}

        {needsPrice && (
          <Field label="Preço unitário">
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              value={form.preco}
              onChange={e => set('preco', e.target.value)}
              placeholder="0,00"
            />
          </Field>
        )}

        {needsPrecoKilo && (
          <Field label="Preço por kg (R$)">
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              value={form.precoKilo}
              onChange={e => set('precoKilo', e.target.value)}
              placeholder="Ex: 25,00"
            />
          </Field>
        )}

        {!isEdit && tipo === 'PICOLE' && (
          <p className="text-xs text-gray-400">Os preços por quantidade serão configurados após criar a categoria.</p>
        )}

        <Field label="Ordem no cardápio (1 = primeiro)">
          <input
            className="input"
            type="number"
            min="0"
            value={form.ordem}
            onChange={e => set('ordem', parseInt(e.target.value) || 0)}
            placeholder="0"
          />
        </Field>
      </div>
    </Modal>
  )
}

// ── ProdFormModal ────────────────────────────────────────────────
function ProdFormModal({ mode, initial, onSave, onClose, saving }) {
  const [nome, setNome] = useState(initial.nome || '')
  const [ordem, setOrdem] = useState(initial.ordem ?? 0)

  return (
    <Modal
      title={mode === 'edit' ? 'Editar sabor' : 'Novo sabor'}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancelar</button>
          <button
            onClick={() => onSave({ nome, ordem })}
            disabled={saving || !nome}
            className="px-4 py-2 text-sm bg-brand text-white rounded-lg font-medium disabled:opacity-50"
          >
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </>
      }
    >
      <Field label="Nome do sabor">
        <input
          className="input"
          value={nome}
          onChange={e => setNome(e.target.value)}
          placeholder="Ex: Chocolate"
          autoFocus
        />
      </Field>
      <Field label="Ordem (1 = primeiro no cardápio)">
        <input
          className="input"
          type="number"
          min="0"
          value={ordem}
          onChange={e => setOrdem(parseInt(e.target.value) || 0)}
          placeholder="0"
        />
      </Field>
    </Modal>
  )
}

// ── PrecosModal ──────────────────────────────────────────────────
function PrecosModal({ cat, onClose, onSaved }) {
  const [tiers, setTiers] = useState(
    cat.precosPorQuantidade.length > 0
      ? cat.precosPorQuantidade.map(t => ({ qtd: String(t.quantidadeMinima), preco: String(t.preco) }))
      : [{ qtd: '1', preco: '' }]
  )
  const [saving, setSaving] = useState(false)

  function addRow() { setTiers(t => [...t, { qtd: '', preco: '' }]) }
  function removeRow(i) { setTiers(t => t.filter((_, idx) => idx !== i)) }
  function update(i, k, v) { setTiers(t => t.map((r, idx) => idx === i ? { ...r, [k]: v } : r)) }

  async function save() {
    const parsed = tiers
      .filter(r => r.qtd !== '' && r.preco !== '')
      .map(r => ({ quantidadeMinima: parseInt(r.qtd), preco: parseFloat(r.preco) }))
    if (parsed.length === 0) return
    setSaving(true)
    try {
      await api.put(`/api/admin/categorias/${cat.id}/precos`, parsed)
      onSaved(parsed.map(p => ({ quantidadeMinima: p.quantidadeMinima, preco: p.preco })))
    } catch {
      alert('Erro ao salvar preços')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={`Preços — ${cat.nome}`}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancelar</button>
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 text-sm bg-brand text-white rounded-lg font-medium disabled:opacity-50"
          >
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </>
      }
    >
      <div className="space-y-2">
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-xs font-medium text-gray-500 px-1">
          <span>Qtd mínima</span>
          <span>Preço unit.</span>
          <span />
        </div>
        {tiers.map((row, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
            <input
              className="input text-center"
              type="number"
              min="1"
              value={row.qtd}
              onChange={e => update(i, 'qtd', e.target.value)}
              placeholder="1"
            />
            <input
              className="input text-right"
              type="number"
              min="0"
              step="0.01"
              value={row.preco}
              onChange={e => update(i, 'preco', e.target.value)}
              placeholder="0,00"
            />
            <button
              onClick={() => removeRow(i)}
              disabled={tiers.length === 1}
              className="text-red-400 hover:text-red-600 disabled:opacity-20 p-1"
            >
              ✕
            </button>
          </div>
        ))}
        <button onClick={addRow} className="text-xs text-brand font-medium hover:underline mt-1">
          + Adicionar faixa
        </button>
      </div>
      <p className="text-xs text-gray-400 mt-3">
        Ex: qtd 1 → R$ 4,00 / qtd 10 → R$ 3,50 / qtd 20 → R$ 3,00
      </p>
    </Modal>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  )
}
