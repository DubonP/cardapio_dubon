import { useState, useEffect } from 'react'
import api from '../lib/api'

export default function Configuracoes() {
  const [form, setForm] = useState({ taxa_entrega: '', whatsapp_loja: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const { data } = await api.get('/api/admin/configuracoes')
      // data is an object: { taxa_entrega: '...', whatsapp_loja: '...' }
      setForm({
        taxa_entrega: data.taxa_entrega ?? '',
        whatsapp_loja: data.whatsapp_loja ?? '',
      })
    } catch {
      setErr('Erro ao carregar configurações')
    } finally {
      setLoading(false)
    }
  }

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    setSaved(false)
    setErr('')
    try {
      await Promise.all([
        api.patch('/api/admin/configuracoes/taxa_entrega', { valor: String(form.taxa_entrega) }),
        api.patch('/api/admin/configuracoes/whatsapp_loja', { valor: String(form.whatsapp_loja) }),
      ])
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch {
      setErr('Erro ao salvar configurações')
    } finally {
      setSaving(false)
    }
  }

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  if (loading) return <div className="text-center py-16 text-gray-400">Carregando…</div>

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Configurações</h1>

      <form onSubmit={save} className="max-w-md space-y-6">
        <Card title="Entrega" icon="🛵">
          <Field label="Taxa de entrega (R$)">
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              value={form.taxa_entrega}
              onChange={e => set('taxa_entrega', e.target.value)}
              placeholder="0,00"
            />
            <p className="text-xs text-gray-400 mt-1">Digite 0 para entrega grátis</p>
          </Field>
        </Card>

        <Card title="WhatsApp" icon="💬">
          <Field label="Número da loja">
            <input
              className="input"
              type="tel"
              inputMode="numeric"
              value={form.whatsapp_loja}
              onChange={e => set('whatsapp_loja', e.target.value)}
              placeholder="Ex: 44999999999"
            />
            <p className="text-xs text-gray-400 mt-1">Sem espaços ou traços. Com DDD, sem +55.</p>
          </Field>
        </Card>

        {err && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2.5">
            {err}
          </div>
        )}

        {saved && (
          <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-2.5">
            ✓ Configurações salvas com sucesso
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="bg-brand text-white font-semibold px-6 py-2.5 rounded-lg hover:bg-brand-light transition-colors disabled:opacity-60"
        >
          {saving ? 'Salvando…' : 'Salvar configurações'}
        </button>
      </form>
    </div>
  )
}

function Card({ title, icon, children }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border p-5">
      <h2 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
        <span>{icon}</span>
        <span>{title}</span>
      </h2>
      {children}
    </div>
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
