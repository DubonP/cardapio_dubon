import { useState, useEffect } from 'react'
import api from '../lib/api'

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
const DEFAULT_HORARIO = { abre: '12:00', fecha: '22:00', ativo: true }

function horariosFromRaw(raw) {
  let parsed = {}
  try { if (raw) parsed = JSON.parse(raw) } catch {}
  return Array.from({ length: 7 }, (_, i) => ({
    dia: i,
    ...DEFAULT_HORARIO,
    ...(parsed[String(i)] ?? {}),
  }))
}

export default function Configuracoes() {
  const [form, setForm] = useState({ taxa_entrega: '', whatsapp_loja: '' })
  const [horarios, setHorarios] = useState(() => horariosFromRaw(null))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const { data } = await api.get('/api/admin/configuracoes')
      setForm({
        taxa_entrega: data.taxa_entrega ?? '',
        whatsapp_loja: data.whatsapp_loja ?? '',
      })
      setHorarios(horariosFromRaw(data.horarios_funcionamento))
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
      const horariosObj = {}
      horarios.forEach(h => {
        horariosObj[String(h.dia)] = { abre: h.abre, fecha: h.fecha, ativo: h.ativo }
      })

      await Promise.all([
        api.patch('/api/admin/configuracoes/taxa_entrega',           { valor: String(form.taxa_entrega) }),
        api.patch('/api/admin/configuracoes/whatsapp_loja',          { valor: String(form.whatsapp_loja) }),
        api.patch('/api/admin/configuracoes/horarios_funcionamento', { valor: JSON.stringify(horariosObj) }),
      ])
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch {
      setErr('Erro ao salvar configurações')
    } finally {
      setSaving(false)
    }
  }

  function setField(k, v) { setForm(f => ({ ...f, [k]: v })) }

  function setHorario(dia, campo, valor) {
    setHorarios(hs => hs.map(h => h.dia === dia ? { ...h, [campo]: valor } : h))
  }

  if (loading) return <div className="text-center py-16 text-gray-400">Carregando…</div>

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Configurações</h1>

      <form onSubmit={save} className="max-w-lg space-y-6">

        {/* Entrega */}
        <Card title="Entrega" icon="🛵">
          <Field label="Taxa de entrega (R$)">
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              value={form.taxa_entrega}
              onChange={e => setField('taxa_entrega', e.target.value)}
              placeholder="0,00"
            />
            <p className="text-xs text-gray-400 mt-1">Digite 0 para entrega grátis</p>
          </Field>
        </Card>

        {/* WhatsApp */}
        <Card title="WhatsApp" icon="💬">
          <Field label="Número da loja">
            <input
              className="input"
              type="tel"
              inputMode="numeric"
              value={form.whatsapp_loja}
              onChange={e => setField('whatsapp_loja', e.target.value)}
              placeholder="Ex: 44999999999"
            />
            <p className="text-xs text-gray-400 mt-1">Sem espaços ou traços. Com DDD, sem +55.</p>
          </Field>
        </Card>

        {/* Horários */}
        <Card title="Horário de funcionamento" icon="🕐">
          <p className="text-xs text-gray-400 mb-3">
            Padrão (sem configuração): 12:00 – 22:00. Desative o dia para fechar nele.
          </p>
          <div className="space-y-2">
            {horarios.map(h => (
              <div key={h.dia} className={`grid grid-cols-[90px_1fr_1fr_auto] gap-2 items-center py-1.5 px-2 rounded-lg ${h.ativo ? '' : 'opacity-40'}`}>
                <span className="text-sm font-medium text-gray-700">{DIAS[h.dia]}</span>

                <div>
                  <label className="text-xs text-gray-400 block mb-0.5">Abre</label>
                  <input
                    type="time"
                    className="input py-1 text-sm"
                    value={h.abre}
                    disabled={!h.ativo}
                    onChange={e => setHorario(h.dia, 'abre', e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-xs text-gray-400 block mb-0.5">Fecha</label>
                  <input
                    type="time"
                    className="input py-1 text-sm"
                    value={h.fecha}
                    disabled={!h.ativo}
                    onChange={e => setHorario(h.dia, 'fecha', e.target.value)}
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setHorario(h.dia, 'ativo', !h.ativo)}
                  className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 mt-4 ${h.ativo ? 'bg-brand' : 'bg-gray-200'}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${h.ativo ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
              </div>
            ))}
          </div>
        </Card>

        {err && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2.5">{err}</div>
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
        <span>{icon}</span><span>{title}</span>
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
