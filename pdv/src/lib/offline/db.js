import { openDB } from 'idb'

const DB_NAME = 'dubon-pdv-offline'
const DB_VERSION = 1

let dbPromise = null

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('filaOperacoes')) {
          db.createObjectStore('filaOperacoes', { keyPath: 'id', autoIncrement: true })
        }
        if (!db.objectStoreNames.contains('comandasLocal')) {
          db.createObjectStore('comandasLocal', { keyPath: 'localId' })
        }
        if (!db.objectStoreNames.contains('caixaLocal')) {
          db.createObjectStore('caixaLocal', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('cardapioLocal')) {
          db.createObjectStore('cardapioLocal', { keyPath: 'id' })
        }
      },
    })
  }
  return dbPromise
}

export function gerarIdTemporario() {
  return `tmp-${crypto.randomUUID()}`
}

export function ehIdTemporario(id) {
  return typeof id === 'string' && id.startsWith('tmp-')
}

// ─── Fila de operações pendentes ───────────────────────────────────────────

export async function enfileirar(operacao) {
  const db = await getDB()
  return db.add('filaOperacoes', {
    ...operacao,
    criadoEm: new Date().toISOString(),
    status: 'pendente',
    erro: null,
  })
}

export async function listarFila() {
  const db = await getDB()
  const todas = await db.getAll('filaOperacoes')
  return todas.sort((a, b) => a.id - b.id)
}

export async function removerDaFila(id) {
  const db = await getDB()
  await db.delete('filaOperacoes', id)
}

export async function marcarErroFila(id, erro) {
  const db = await getDB()
  const op = await db.get('filaOperacoes', id)
  if (!op) return
  await db.put('filaOperacoes', { ...op, status: 'erro', erro })
}

export async function contarPendentes() {
  const fila = await listarFila()
  return fila.length
}

// ─── Espelho local de comandas ─────────────────────────────────────────────

export async function salvarComandaLocal(comanda) {
  const db = await getDB()
  await db.put('comandasLocal', comanda)
}

export async function getComandaLocal(localId) {
  const db = await getDB()
  return db.get('comandasLocal', localId)
}

export async function listarComandasLocais() {
  const db = await getDB()
  return db.getAll('comandasLocal')
}

export async function removerComandaLocal(localId) {
  const db = await getDB()
  await db.delete('comandasLocal', localId)
}

// ─── Espelho local do caixa do dia ─────────────────────────────────────────

export async function salvarCaixaLocal(caixa) {
  const db = await getDB()
  await db.put('caixaLocal', { ...caixa, id: 'hoje' })
}

export async function getCaixaLocal() {
  const db = await getDB()
  return db.get('caixaLocal', 'hoje')
}

// ─── Espelho local do cardápio ──────────────────────────────────────────────

export async function salvarCardapioLocal(cardapio) {
  const db = await getDB()
  await db.put('cardapioLocal', { id: 'atual', dados: cardapio })
}

export async function getCardapioLocal() {
  const db = await getDB()
  const row = await db.get('cardapioLocal', 'atual')
  return row?.dados || null
}
