import { useState } from 'react'
import { getRole, setRole, ROLE_LABELS } from '../lib/offline/role'

export default function DeviceRoleGate({ children }) {
  const [role, setRoleState] = useState(getRole())

  if (role) return children

  function escolher(r) {
    setRole(r)
    setRoleState(r)
  }

  return (
    <div className="fixed inset-0 bg-brand flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <h1 className="text-lg font-bold text-slate-800">Qual é este dispositivo?</h1>
        <p className="text-sm text-slate-500">
          Isso define se este computador continua funcionando quando a internet cair.
          Escolha uma vez só — dá pra trocar depois pelo cabeçalho do PDV.
        </p>
        <div className="space-y-2">
          {Object.entries(ROLE_LABELS).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => escolher(key)}
              className="w-full border border-slate-300 rounded-xl py-3 font-semibold text-slate-700 hover:border-brand hover:text-brand"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
