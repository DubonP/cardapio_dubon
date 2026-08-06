import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import * as db from '../lib/offline/db'
import { getRole, ROLE_LABELS } from '../lib/offline/role'
import { useOnlineStatus } from '../lib/offline/useOnlineStatus'
import { useSyncState } from '../lib/offline/useSyncState'
import { tentarSincronizar } from '../lib/offline/sync'

export default function Debug() {
  const navigate = useNavigate()
  const online = useOnlineStatus()
  const sync = useSyncState()
  const [fila, setFila] = useState([])
  const [comandasLocais, setComandasLocais] = useState([])
  const [caixaLocal, setCaixaLocal] = useState(null)

  const carregar = useCallback(async () => {
    setFila(await db.listarFila())
    setComandasLocais(await db.listarComandasLocais())
    setCaixaLocal(await db.getCaixaLocal())
  }, [])

  useEffect(() => {
    carregar()
    const interval = setInterval(carregar, 3000)
    return () => clearInterval(interval)
  }, [carregar])

  return (
    <div className="min-h-screen bg-slate-100 p-4 space-y-4 text-sm font-mono">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-slate-800 font-sans">PDV — Debug offline</h1>
        <button
          onClick={() => navigate('/')}
          className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 font-sans"
        >
          Voltar
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-3 space-y-1 font-sans">
        <p><strong>Dispositivo:</strong> {ROLE_LABELS[getRole()] || '—'}</p>
        <p><strong>Conexão:</strong> {online ? 'Online' : 'Offline'}</p>
        <p><strong>Sincronização:</strong> {sync.rodando ? 'rodando' : 'parada'} · {sync.pendentes} pendente(s)</p>
        {sync.erro && <p className="text-red-600"><strong>Erro:</strong> {sync.erro}</p>}
        <button
          onClick={() => tentarSincronizar()}
          className="mt-2 bg-brand text-white rounded-lg px-3 py-1.5"
        >
          Forçar tentativa de sincronização
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-3">
        <p className="font-sans font-bold mb-2">Fila de operações pendentes ({fila.length})</p>
        <pre className="overflow-x-auto text-xs bg-slate-50 p-2 rounded-lg">{JSON.stringify(fila, null, 2)}</pre>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-3">
        <p className="font-sans font-bold mb-2">Comandas no espelho local ({comandasLocais.length})</p>
        <pre className="overflow-x-auto text-xs bg-slate-50 p-2 rounded-lg">{JSON.stringify(comandasLocais, null, 2)}</pre>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-3">
        <p className="font-sans font-bold mb-2">Caixa no espelho local</p>
        <pre className="overflow-x-auto text-xs bg-slate-50 p-2 rounded-lg">{JSON.stringify(caixaLocal, null, 2)}</pre>
      </div>
    </div>
  )
}
