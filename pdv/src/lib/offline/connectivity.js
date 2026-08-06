import api from '../api'

const PING_INTERVAL_MS = 15000

let online = navigator.onLine
let pingTimer = null
const listeners = new Set()

function emit() {
  listeners.forEach((fn) => fn(online))
}

function setOnline(value) {
  if (value === online) return
  online = value
  emit()
}

async function ping() {
  try {
    await api.get('/api/cardapio', { timeout: 5000 })
    setOnline(true)
  } catch {
    setOnline(false)
  }
}

window.addEventListener('online', ping)
window.addEventListener('offline', () => setOnline(false))

if (!pingTimer) {
  pingTimer = setInterval(ping, PING_INTERVAL_MS)
  ping()
}

export function isOnline() {
  return online
}

export function onConnectivityChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
