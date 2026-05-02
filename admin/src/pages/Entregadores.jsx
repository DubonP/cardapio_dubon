import { useState, useEffect } from 'react'
import api from '../lib/api'
import Modal from '../components/Modal'

const INITIAL = { nome: '', whatsapp: '' }

export default function Entregadores() {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)  // null | { mode:'add'|'edit', data }
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const { data } = await api.get('/api/admin/entregadores')
      setList(data)
    } finally {
      setLoading(false)
    }
  }

  async function toggleAtivo(ent) {
    // Only one entregador can be ativo at a time
    const prev = list
    const newAtivo = !ent.ativo
    setList(ls =>
      ls.map(e => ({ ...e, ativo: e.id === ent.id ? newAtivo : newAtivo ? false : e.ativo }))
    )
    try {
      await api.patch(`/api/admin/entregadores/${ent.id}`, { ativo: newAtivo })
      // Reload to get consistent state from server
      const { data } = await api.get('/api/admin/entregadores')
      setList(data)
    } catch {
      setList(prev)
    }
  }

  async function saveEntregador(form) {
    setSaving(true)
    try {
      if (modal.mode === 'add') {
        const { data } = await api.post('/api/admin/entregadores', form)
        setList(ls => [...ls, data])
      } else {
        await api.patch(`/api/admin/entregadores/${modal.data.id}`, form)
        setList(ls => ls.map(e => e.id === modal.data.id ? { ...e, ...form } : e))
      }
      setModal(null)
    } catch {
      alert('Erro ao salvar entregador')
    } finally {
      setSaving(false)
    }
  }

  async function deleteEntregador(id) {
    if (!confirm('Excluir entregador?')) return
    const prev = list
    setList(ls => ls.filter(e => e.id !== id))
    try {
      await api.delete(`/api/admin/entregadores/${id}`)
    } catch {
      setList(prev)
      alert('Erro ao excluir entregador')
    }
  }

  if (loading) return <div className="text-center py-16 text-gray-400">Carregando…</div>

  const ativos = list.filter(e => e.ativo)
  const inativos = list.filter(e => !e.ativo)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Entregadores</h1>
        <button
          onClick={() => setModal({ mode: 'add', data: { ...INITIAL } })}
          className="bg-brand text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-brand-light transition-colors"
        >
          + Entregador
        </button>
      </div>

      {ativos.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Ativo hoje</h2>
          <div className="space-y-2">
            {ativos.map(e => <EntregadorCard key={e.id} ent={e} onToggle={() => toggleAtivo(e)} onEdit={() => setModal({ mode: 'edit', data: e })} onDelete={() => deleteEntregador(e.id)} />)}
          </div>
        </div>
      )}

      {inativos.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Inativos</h2>
          <div className="space-y-2">
            {inativos.map(e => <EntregadorCard key={e.id} ent={e} onToggle={() => toggleAtivo(e)} onEdit={() => setModal({ mode: 'edit', data: e })} onDelete={() => deleteEntregador(e.id)} />)}
          </div>
        </div>
      )}

      {list.length === 0 && (
        <div className="text-center py-16 text-gray-400">Nenhum entregador cadastrado</div>
      )}

      {modal && (
        <FormModal
          mode={modal.mode}
          initial={modal.data}
          onSave={saveEntregador}
          onClose={() => setModal(null)}
          saving={saving}
        />
      )}
    </div>
  )
}

function EntregadorCard({ ent, onToggle, onEdit, onDelete }) {
  return (
    <div className={`bg-white rounded-xl shadow-sm border p-4 flex items-center gap-3 transition-opacity ${ent.ativo ? '' : 'opacity-60'}`}>
      <div className="w-10 h-10 rounded-full bg-brand/10 flex items-center justify-center text-xl flex-shrink-0">
        🛵
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-800">{ent.nome}</span>
          {ent.ativo && (
            <span className="text-xs bg-green-100 text-green-700 font-semibold px-2 py-0.5 rounded-full">
              ATIVO HOJE
            </span>
          )}
        </div>
        {ent.whatsapp && (
          <a
            href={`https://wa.me/55${ent.whatsapp.replace(/\D/g, '')}`}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-gray-400 hover:text-green-600"
          >
            {ent.whatsapp}
          </a>
        )}
      </div>
      <button onClick={onEdit} className="text-gray-300 hover:text-gray-600 p-1.5">✏️</button>
      <button onClick={onDelete} className="text-gray-300 hover:text-red-400 p-1.5">🗑️</button>
      <label className="flex items-center gap-1.5 cursor-pointer">
        <span className="text-xs text-gray-400">{ent.ativo ? 'Ativo' : 'Ativar'}</span>
        <button
          onClick={onToggle}
          className={`relative w-9 h-5 rounded-full transition-colors ${ent.ativo ? 'bg-brand' : 'bg-gray-200'}`}
        >
          <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${ent.ativo ? 'translate-x-4' : 'translate-x-0.5'}`} />
        </button>
      </label>
    </div>
  )
}

function FormModal({ mode, initial, onSave, onClose, saving }) {
  const [form, setForm] = useState({ nome: initial.nome || '', whatsapp: initial.whatsapp || '' })
  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  return (
    <Modal
      title={mode === 'edit' ? 'Editar entregador' : 'Novo entregador'}
      onClose={onClose}
      size="sm"
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
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
          <input
            className="input"
            value={form.nome}
            onChange={e => set('nome', e.target.value)}
            placeholder="Nome do entregador"
            autoFocus
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp</label>
          <input
            className="input"
            type="tel"
            inputMode="numeric"
            value={form.whatsapp}
            onChange={e => set('whatsapp', e.target.value)}
            placeholder="Ex: 44999999999"
          />
        </div>
      </div>
    </Modal>
  )
}
