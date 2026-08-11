import api from '../api'
import * as db from './db'
import { isPrincipal } from './role'
import { isOnline } from './connectivity'

const TIMEOUT_MS = 8000

function erroDeRede(err) {
  return !err.response
}

// Leitura: qualquer dispositivo pode cair pro espelho local quando offline.
// Se já sabemos que está offline (connectivity.js), nem tenta rede — evita
// ficar esperando o timeout em cada refresh automático (comandas, caixa, ...).
async function comLeituraOffline({ tentar, aoFalhar }) {
  if (!isOnline()) return aoFalhar()
  try {
    return await tentar()
  } catch (err) {
    if (!erroDeRede(err)) throw err
    return aoFalhar()
  }
}

// Escrita: só o dispositivo "principal" enfileira e segue otimista;
// nos demais, o erro de rede sobe normalmente (a UI bloqueia antes disso, ver Fase 6).
async function comEscritaOffline({ tentar, aoFalhar }) {
  if (!isOnline()) {
    if (!isPrincipal()) throw new Error('Sem conexão')
    return aoFalhar()
  }
  try {
    return await tentar()
  } catch (err) {
    if (!erroDeRede(err)) throw err
    if (!isPrincipal()) throw err
    return aoFalhar()
  }
}

const TIPOS_SEM_MULTIPLICAR = ['KILO', 'KILO_BOLO', 'OUTROS']

function totalDoItem(item) {
  return TIPOS_SEM_MULTIPLICAR.includes(item.tipo)
    ? item.valorUnitario
    : item.valorUnitario * item.quantidade
}

function recalcularTotal(itens) {
  return itens.reduce((s, i) => s + totalDoItem(i), 0)
}

async function cancelarOperacoesPendentesDaComanda(comandaLocalId) {
  const fila = await db.listarFila()
  for (const op of fila.filter((o) => o.comandaId === comandaLocalId)) {
    await db.removerDaFila(op.id)
  }
}

async function removerOperacaoPendenteDoItem(itemIdLocal) {
  const fila = await db.listarFila()
  const alvo = fila.find((op) => op.tipo === 'adicionarItem' && op.itemIdLocal === itemIdLocal)
  if (alvo) await db.removerDaFila(alvo.id)
}

// ─── Comandas ───────────────────────────────────────────────────────────────

export async function listarComandas() {
  return comLeituraOffline({
    tentar: async () => {
      const { data } = await api.get('/api/pdv/comandas', { timeout: TIMEOUT_MS })
      return data
    },
    aoFalhar: async () => {
      const locais = await db.listarComandasLocais()
      return locais.filter((c) => c.status === 'ABERTO')
    },
  })
}

export async function carregarComanda(id) {
  if (db.ehIdTemporario(id)) {
    const local = await db.getComandaLocal(id)
    if (!local) throw new Error('Comanda offline não encontrada neste dispositivo')
    return local
  }
  return comLeituraOffline({
    tentar: async () => {
      const { data } = await api.get(`/api/pdv/comandas/${id}`, { timeout: TIMEOUT_MS })
      await db.salvarComandaLocal({ ...data, localId: String(data.id) })
      return data
    },
    aoFalhar: async () => {
      const local = await db.getComandaLocal(String(id))
      if (!local) throw new Error('Comanda indisponível offline neste dispositivo')
      return local
    },
  })
}

export async function criarComanda({ clienteNome } = {}) {
  return comEscritaOffline({
    tentar: async () => {
      const { data } = await api.post(
        '/api/pdv/comandas',
        clienteNome ? { clienteNome } : {},
        { timeout: TIMEOUT_MS },
      )
      await db.salvarComandaLocal({ ...data, localId: String(data.id) })
      return data
    },
    aoFalhar: async () => {
      const localId = db.gerarIdTemporario()
      const comanda = {
        id: localId,
        localId,
        clienteNome: clienteNome || '—',
        status: 'ABERTO',
        itens: [],
        total: 0,
        criadoEm: new Date().toISOString(),
        offline: true,
      }
      await db.salvarComandaLocal(comanda)
      await db.enfileirar({ tipo: 'criarComanda', comandaId: localId, payload: { clienteNome: clienteNome || undefined } })
      return comanda
    },
  })
}

// Comanda "reserva": sem nome e sem itens — sempre deve existir uma
// disponível enquanto o caixa está aberto, pronta pro próximo cliente.
export function ehReserva(comanda) {
  return (!comanda?.clienteNome || comanda.clienteNome === '—') && (comanda?.itens?.length || 0) === 0
}

let garantindoReserva = false

export async function garantirComandaReserva() {
  if (garantindoReserva) return
  garantindoReserva = true
  try {
    const comandas = await listarComandas()
    if (!comandas.some(ehReserva)) {
      await criarComanda()
    }
  } catch (err) {
    // não interrompe o fluxo principal (ex: salvar nome, adicionar item),
    // mas registra pra dar pra diagnosticar — normalmente é caixa fechado.
    console.warn('[garantirComandaReserva] não conseguiu garantir a reserva:', err.response?.data?.error || err.message)
  } finally {
    garantindoReserva = false
  }
}

export async function adicionarItem(comandaId, item) {
  const resultado = await comEscritaOffline({
    tentar: async () => {
      const { data } = await api.post(`/api/pdv/comandas/${comandaId}/itens`, item, { timeout: TIMEOUT_MS })
      await db.salvarComandaLocal({ ...data, localId: String(data.id) })
      return data
    },
    aoFalhar: async () => {
      const atual = await db.getComandaLocal(String(comandaId))
      if (!atual) throw new Error('Comanda offline não encontrada neste dispositivo')
      const novoItem = { ...item, id: db.gerarIdTemporario(), valorTotal: totalDoItem(item) }
      const itens = [...atual.itens, novoItem]
      const atualizada = { ...atual, itens, total: recalcularTotal(itens) }
      await db.salvarComandaLocal(atualizada)
      await db.enfileirar({
        tipo: 'adicionarItem',
        comandaId: atual.localId,
        payload: item,
        itemIdLocal: novoItem.id,
      })
      return atualizada
    },
  })
  garantirComandaReserva()
  return resultado
}

export async function removerItem(comandaId, itemId) {
  return comEscritaOffline({
    tentar: async () => {
      const { data } = await api.delete(`/api/pdv/comandas/${comandaId}/itens/${itemId}`, { timeout: TIMEOUT_MS })
      await db.salvarComandaLocal({ ...data, localId: String(data.id) })
      return data
    },
    aoFalhar: async () => {
      const atual = await db.getComandaLocal(String(comandaId))
      if (!atual) throw new Error('Comanda offline não encontrada neste dispositivo')
      const itens = atual.itens.filter((i) => String(i.id) !== String(itemId))
      const atualizada = { ...atual, itens, total: recalcularTotal(itens) }
      await db.salvarComandaLocal(atualizada)
      if (db.ehIdTemporario(itemId)) {
        // item nunca chegou a ser enviado ao servidor — não há o que sincronizar
        await removerOperacaoPendenteDoItem(itemId)
      } else {
        await db.enfileirar({ tipo: 'removerItem', comandaId: atual.localId, payload: {}, itemId })
      }
      return atualizada
    },
  })
}

export async function salvarNome(comandaId, novoNome) {
  const resultado = await comEscritaOffline({
    tentar: async () => {
      const { data } = await api.patch(`/api/pdv/comandas/${comandaId}/nome`, { clienteNome: novoNome }, { timeout: TIMEOUT_MS })
      await db.salvarComandaLocal({ ...data, localId: String(data.id) })
      return data
    },
    aoFalhar: async () => {
      const atual = await db.getComandaLocal(String(comandaId))
      if (!atual) throw new Error('Comanda offline não encontrada neste dispositivo')
      const atualizada = { ...atual, clienteNome: novoNome }
      await db.salvarComandaLocal(atualizada)
      await db.enfileirar({ tipo: 'renomearComanda', comandaId: atual.localId, payload: { clienteNome: novoNome } })
      return atualizada
    },
  })
  garantirComandaReserva()
  return resultado
}

export async function finalizarComanda(comandaId, { formaPagamento, pagamentos }) {
  return comEscritaOffline({
    tentar: async () => {
      const { data } = await api.patch(
        `/api/pdv/comandas/${comandaId}/finalizar`,
        { formaPagamento, pagamentos },
        { timeout: TIMEOUT_MS },
      )
      await db.removerComandaLocal(String(comandaId))
      return data
    },
    aoFalhar: async () => {
      const atual = await db.getComandaLocal(String(comandaId))
      if (!atual) throw new Error('Comanda offline não encontrada neste dispositivo')
      const atualizada = { ...atual, status: 'FINALIZADO', formaPagamento, pagamentos }
      await db.salvarComandaLocal(atualizada)
      await db.enfileirar({
        tipo: 'finalizarComanda',
        comandaId: atual.localId,
        payload: { formaPagamento, pagamentos },
      })
      return atualizada
    },
  })
}

export async function cancelarComanda(comandaId) {
  return comEscritaOffline({
    tentar: async () => {
      const { data } = await api.patch(`/api/pdv/comandas/${comandaId}/cancelar`, undefined, { timeout: TIMEOUT_MS })
      await db.removerComandaLocal(String(comandaId))
      return data
    },
    aoFalhar: async () => {
      const atual = await db.getComandaLocal(String(comandaId))
      if (!atual) throw new Error('Comanda offline não encontrada neste dispositivo')
      if (db.ehIdTemporario(atual.localId)) {
        // comanda inteira nasceu e morreu offline — nada a sincronizar
        await cancelarOperacoesPendentesDaComanda(atual.localId)
        await db.removerComandaLocal(atual.localId)
        return { ...atual, status: 'CANCELADO' }
      }
      const atualizada = { ...atual, status: 'CANCELADO' }
      await db.salvarComandaLocal(atualizada)
      await db.enfileirar({ tipo: 'cancelarComanda', comandaId: atual.localId, payload: {} })
      return atualizada
    },
  })
}

export async function carregarCardapio() {
  return comLeituraOffline({
    tentar: async () => {
      const { data } = await api.get('/api/cardapio', { timeout: TIMEOUT_MS })
      await db.salvarCardapioLocal(data)
      return data
    },
    aoFalhar: async () => {
      const local = await db.getCardapioLocal()
      if (!local) throw new Error('Cardápio indisponível offline neste dispositivo')
      return local
    },
  })
}

// ─── Caixa ────────────────────────────────────────────────────────────────

export async function carregarCaixaHoje() {
  return comLeituraOffline({
    tentar: async () => {
      const { data } = await api.get('/api/pdv/caixa/hoje', { timeout: TIMEOUT_MS })
      if (data.caixa) await db.salvarCaixaLocal(data.caixa)
      return data
    },
    aoFalhar: async () => {
      const local = await db.getCaixaLocal()
      return { caixa: local || null, naoFechado: null }
    },
  })
}

export async function abrirCaixa(payload) {
  return comEscritaOffline({
    tentar: async () => {
      const { data } = await api.post('/api/pdv/caixa/abrir', payload, { timeout: TIMEOUT_MS })
      await db.salvarCaixaLocal(data)
      return data
    },
    aoFalhar: async () => {
      const caixa = { status: 'ABERTO', movimentacoes: [], ...payload, offline: true }
      await db.salvarCaixaLocal(caixa)
      await db.enfileirar({ tipo: 'abrirCaixa', comandaId: null, payload })
      return caixa
    },
  })
}

export async function fecharCaixa(payload) {
  return comEscritaOffline({
    tentar: async () => {
      const { data } = await api.post('/api/pdv/caixa/fechar', payload, { timeout: TIMEOUT_MS })
      await db.salvarCaixaLocal(data)
      return data
    },
    aoFalhar: async () => {
      const atual = (await db.getCaixaLocal()) || {}
      const caixa = { ...atual, ...payload, status: 'FECHADO' }
      await db.salvarCaixaLocal(caixa)
      await db.enfileirar({ tipo: 'fecharCaixa', comandaId: null, payload })
      return caixa
    },
  })
}

// Retorna só a movimentação criada (mesmo contrato do endpoint real),
// quem chama já sabe mesclar no caixa em memória.
export async function registrarMovimentacao(payload) {
  return comEscritaOffline({
    tentar: async () => {
      const { data } = await api.post('/api/pdv/caixa/movimentacoes', payload, { timeout: TIMEOUT_MS })
      const atual = await db.getCaixaLocal()
      if (atual) await db.salvarCaixaLocal({ ...atual, movimentacoes: [...(atual.movimentacoes || []), data] })
      return data
    },
    aoFalhar: async () => {
      const mov = { ...payload, id: db.gerarIdTemporario() }
      const atual = (await db.getCaixaLocal()) || { movimentacoes: [] }
      await db.salvarCaixaLocal({ ...atual, movimentacoes: [...(atual.movimentacoes || []), mov] })
      await db.enfileirar({ tipo: 'registrarMovimentacao', comandaId: null, payload })
      return mov
    },
  })
}
