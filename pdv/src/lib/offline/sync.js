import api from '../api'
import * as db from './db'
import { isPrincipal } from './role'
import { onConnectivityChange, isOnline } from './connectivity'

const TIMEOUT_MS = 15000

const listeners = new Set()
let estado = { rodando: false, pendentes: 0, erro: null, precisaLogin: false }
let processando = false

function emit() {
  listeners.forEach((fn) => fn(estado))
}

async function atualizarContagem() {
  estado = { ...estado, pendentes: await db.contarPendentes() }
  emit()
}

export function onSyncChange(fn) {
  listeners.add(fn)
  fn(estado)
  return () => listeners.delete(fn)
}

export function getSyncState() {
  return estado
}

function resolverId(id, mapa) {
  return id && db.ehIdTemporario(id) ? (mapa.get(id) ?? id) : id
}

async function garantirConhecidos(comandaKeyLocal, conhecidos) {
  if (conhecidos.has(comandaKeyLocal)) return
  const local = await db.getComandaLocal(comandaKeyLocal)
  const reais = (local?.itens || []).filter((i) => !db.ehIdTemporario(i.id)).map((i) => i.id)
  conhecidos.set(comandaKeyLocal, new Set(reais))
}

async function processarOperacao(op, ctx) {
  const { mapaComandas, mapaItens, conhecidos } = ctx
  const comandaIdReal = resolverId(op.comandaId, mapaComandas)

  switch (op.tipo) {
    case 'criarComanda': {
      const { data } = await api.post(
        '/api/pdv/comandas',
        op.payload?.clienteNome ? { clienteNome: op.payload.clienteNome } : {},
        { timeout: TIMEOUT_MS },
      )
      mapaComandas.set(op.comandaId, data.id)
      conhecidos.set(op.comandaId, new Set(data.itens.map((i) => i.id)))
      await db.removerComandaLocal(op.comandaId)
      await db.salvarComandaLocal({ ...data, localId: String(data.id) })
      return
    }

    case 'adicionarItem': {
      await garantirConhecidos(op.comandaId, conhecidos)
      const jaConhecidos = conhecidos.get(op.comandaId)
      const { data } = await api.post(`/api/pdv/comandas/${comandaIdReal}/itens`, op.payload, { timeout: TIMEOUT_MS })
      const novo = data.itens.find((i) => !jaConhecidos.has(i.id))
      if (novo && op.itemIdLocal) mapaItens.set(op.itemIdLocal, novo.id)
      conhecidos.set(op.comandaId, new Set(data.itens.map((i) => i.id)))
      await db.salvarComandaLocal({ ...data, localId: String(data.id) })
      return
    }

    case 'removerItem': {
      const itemIdReal = resolverId(op.itemId, mapaItens)
      const { data } = await api.delete(`/api/pdv/comandas/${comandaIdReal}/itens/${itemIdReal}`, { timeout: TIMEOUT_MS })
      await db.salvarComandaLocal({ ...data, localId: String(data.id) })
      return
    }

    case 'renomearComanda': {
      const { data } = await api.patch(`/api/pdv/comandas/${comandaIdReal}/nome`, op.payload, { timeout: TIMEOUT_MS })
      await db.salvarComandaLocal({ ...data, localId: String(data.id) })
      return
    }

    case 'finalizarComanda': {
      await api.patch(`/api/pdv/comandas/${comandaIdReal}/finalizar`, op.payload, { timeout: TIMEOUT_MS })
      await db.removerComandaLocal(op.comandaId)
      return
    }

    case 'cancelarComanda': {
      await api.patch(`/api/pdv/comandas/${comandaIdReal}/cancelar`, undefined, { timeout: TIMEOUT_MS })
      await db.removerComandaLocal(op.comandaId)
      return
    }

    case 'abrirCaixa': {
      const { data } = await api.post('/api/pdv/caixa/abrir', op.payload, { timeout: TIMEOUT_MS })
      await db.salvarCaixaLocal(data)
      return
    }

    case 'fecharCaixa': {
      const { data } = await api.post('/api/pdv/caixa/fechar', op.payload, { timeout: TIMEOUT_MS })
      await db.salvarCaixaLocal(data)
      return
    }

    case 'registrarMovimentacao': {
      await api.post('/api/pdv/caixa/movimentacoes', op.payload, { timeout: TIMEOUT_MS })
      return
    }

    default:
      throw new Error(`Tipo de operação desconhecido na fila: ${op.tipo}`)
  }
}

export async function tentarSincronizar() {
  if (processando || !isPrincipal() || !isOnline()) return
  processando = true
  estado = { ...estado, rodando: true, erro: null, precisaLogin: false }
  emit()

  const ctx = { mapaComandas: new Map(), mapaItens: new Map(), conhecidos: new Map() }

  try {
    const fila = await db.listarFila()
    for (const op of fila) {
      try {
        await processarOperacao(op, ctx)
        await db.removerDaFila(op.id)
      } catch (err) {
        if (!err.response) {
          // continua sem internet de verdade — tenta de novo na próxima reconexão
          break
        }
        if (err.response.status === 401) {
          estado = { ...estado, erro: 'Sessão expirada — faça login novamente para sincronizar', precisaLogin: true }
          break
        }
        await db.marcarErroFila(op.id, err.response?.data?.error || err.message || 'Erro ao sincronizar')
        estado = { ...estado, erro: `Falha ao sincronizar (${op.tipo}): ${err.response?.data?.error || err.message}` }
        break
      }
    }
  } finally {
    processando = false
    estado = { ...estado, rodando: false, pendentes: await db.contarPendentes() }
    emit()
  }
}

onConnectivityChange((online) => {
  if (online) tentarSincronizar()
})

atualizarContagem()
tentarSincronizar()
