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

      <div className="bg-white rounded-xl border border-slate-200 p-3 space-y-2">
        <p className="font-sans font-bold mb-2">Fila de operações pendentes ({fila.length})</p>
        {Object.entries(
          fila.reduce((grupos, op) => {
            const chave = op.comandaId ?? 'caixa'
            ;(grupos[chave] ||= []).push(op)
            return grupos
          }, {}),
        ).map(([comandaId, ops]) => {
          const temErro = ops.some((op) => op.status === 'erro')
          return (
            <div
              key={comandaId}
              className={`border rounded-lg p-2 space-y-1 font-sans ${temErro ? 'border-red-200 bg-red-50' : 'border-slate-200'}`}
            >
              <p className={temErro ? 'text-red-700' : 'text-slate-700'}>
                <strong>Comanda {comandaId}</strong> — {ops.length} operaç{ops.length === 1 ? 'ão' : 'ões'} na fila
              </p>
              {ops.map((op) => (
                <p key={op.id} className="text-xs text-slate-500 pl-2">
                  {op.status === 'erro' ? '❌' : '⏳'} {op.tipo} {op.erro ? `— ${op.erro}` : ''}
                </p>
              ))}
              {temErro && (
                <>
                  <p className="text-xs text-slate-500">
                    Alguma operação dessa comanda foi recusada pelo servidor (não é falta de internet — ex: a
                    comanda já foi encerrada por outro caminho). Isso trava só essa comanda; as outras sincronizam
                    normalmente. Confira o estado real dela no admin antes de descartar; depois de descartado não
                    tem volta.
                  </p>
                  <button
                    onClick={async () => {
                      if (!window.confirm(`Descartar TODAS as ${ops.length} operação(ões) pendentes da comanda ${comandaId}? Não pode ser desfeito.`)) return
                      for (const op of ops) await db.removerDaFila(op.id)
                      await carregar()
                      tentarSincronizar()
                    }}
                    className="bg-red-600 text-white rounded-lg px-3 py-1 text-xs"
                  >
                    Descartar todas as pendências desta comanda
                  </button>
                </>
              )}
            </div>
          )
        })}
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
