import { useEffect, useState } from 'react'
import { isOnline, onConnectivityChange } from './connectivity'

export function useOnlineStatus() {
  const [online, setOnline] = useState(isOnline())
  useEffect(() => onConnectivityChange(setOnline), [])
  return online
}
