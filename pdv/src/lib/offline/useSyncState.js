import { useEffect, useState } from 'react'
import { getSyncState, onSyncChange } from './sync'

export function useSyncState() {
  const [estado, setEstado] = useState(getSyncState())
  useEffect(() => onSyncChange(setEstado), [])
  return estado
}
