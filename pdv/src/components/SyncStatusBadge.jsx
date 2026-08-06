import { useOnlineStatus } from '../lib/offline/useOnlineStatus'
import { useSyncState } from '../lib/offline/useSyncState'
import { isPrincipal } from '../lib/offline/role'

export default function SyncStatusBadge() {
  const online = useOnlineStatus()
  const sync = useSyncState()
  const principal = isPrincipal()

  if (!online) {
    return (
      <span
        className="text-xs bg-amber-500/90 text-white px-2 py-1 rounded-lg font-semibold whitespace-nowrap"
        title={principal ? 'Continua funcionando — sincroniza quando a internet voltar' : 'Sem conexão — use o computador principal'}
      >
        ● Offline{principal && sync.pendentes > 0 ? ` · ${sync.pendentes} pendente${sync.pendentes > 1 ? 's' : ''}` : ''}
      </span>
    )
  }

  if (principal && sync.erro) {
    return (
      <button
        type="button"
        onClick={() => window.alert(sync.erro)}
        className="text-xs bg-red-600 text-white px-2 py-1 rounded-lg font-semibold whitespace-nowrap"
        title="Toque para ver detalhes"
      >
        ● Erro na sincronização
      </button>
    )
  }

  if (principal && sync.rodando) {
    return (
      <span className="text-xs bg-white/10 px-2 py-1 rounded-lg text-amber-200 whitespace-nowrap">
        ● Sincronizando… {sync.pendentes}
      </span>
    )
  }

  return <span className="text-xs bg-white/10 px-2 py-1 rounded-lg text-emerald-200 whitespace-nowrap">● Online</span>
}
