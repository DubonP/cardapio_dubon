import api from '../api'

const PING_INTERVAL_MS = 30000
const PING_TIMEOUT_MS = 4000

let online = navigator.onLine
let pingTimer = null
let pingEmAndamento = false
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
  // evita empilhar pings simultâneos quando a rede está lenta/instável (não totalmente caída)
  if (pingEmAndamento) return
  pingEmAndamento = true
  try {
    await api.get('/api/cardapio', { timeout: PING_TIMEOUT_MS })
    setOnline(true)
  } catch {
    setOnline(false)
  } finally {
    pingEmAndamento = false
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
