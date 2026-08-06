# PDV offline — design

## Problema

O PDV (`site/pdv/`, React/Vite servido pelo backend Express em `/pdv`, API no Railway) não tem nenhuma infraestrutura offline: sem Service Worker, sem IndexedDB, sem fila local. Toda ação (abrir comanda, adicionar item, finalizar pagamento, abrir/fechar caixa) é uma chamada `axios` direta e síncrona ao backend (`Comanda.jsx`, `PDV.jsx`). Quando a internet cai na loja:

- A rede local/Wi-Fi cai junto (não é só o provedor) — não há como um servidor local na rede ajudar; só algo rodando no próprio dispositivo resolve.
- A página nem carrega (tela de dinossauro), porque nada do app está em cache.
- Nenhuma ação funciona, mesmo se a página já estivesse carregada.

Resultado: a equipe usa papel e caneta enquanto a internet não volta.

## Contexto de uso

- 3 dispositivos usados: `principal`, `secundario`, `tablet`.
- Quando a internet cai, só o `principal` precisa continuar funcionando — os outros podem ficar bloqueados sem prejuízo.
- Quedas são normalmente de minutos, não horas.
- Quer que tudo funcione offline no `principal`, incluindo finalizar comanda com pagamento e abrir/fechar caixa — não só anotar pedido.

Um sistema de usuários com login individual e papéis está sendo considerado para o futuro, mas é um projeto separado — não é pré-requisito deste design. A marcação de papel do dispositivo (`principal`/`secundario`/`tablet`) começa como uma flag local simples e pode ser trocada depois por dado vindo de um sistema de usuários, sem afetar o resto da arquitetura.

## Arquitetura

### 1. Service Worker (app shell)

Usar `vite-plugin-pwa` (Workbox) no build de `site/pdv/` em vez de um Service Worker escrito à mão. Ele:
- Pré-cacheia o HTML/JS/CSS gerado no build.
- Invalida e atualiza o cache automaticamente a cada novo deploy, com aviso de "nova versão disponível" para recarregar.

Isso resolve a tela de dinossauro: o app sempre abre a partir do cache local, independente da rede.

### 2. Papel do dispositivo

Cada dispositivo grava localmente (`localStorage`) uma marcação fixa: `principal`, `secundario` ou `tablet`, configurada uma vez.

- Só o `principal` tem permissão de continuar escrevendo (criar comanda, adicionar/remover item, finalizar pagamento, abrir/fechar caixa, movimentações de caixa) quando offline.
- `secundario` e `tablet`, ao detectar queda de conexão, bloqueiam a tela de novas ações com aviso "Sem conexão — use o computador principal". Continuam podendo ler o último estado conhecido (comandas já carregadas antes da queda).

### 3. Camada de dados local-first

Novo módulo `site/pdv/src/lib/offline/`, que substitui as chamadas diretas `api.post/get/patch/delete` em `Comanda.jsx`/`PDV.jsx` por funções de mais alto nível: `criarComanda()`, `adicionarItem()`, `removerItem()`, `finalizarComanda()`, `cancelarComanda()`, `abrirCaixa()`, `fecharCaixa()`, `registrarMovimentacao()`.

Cada função:
1. Tenta a chamada de rede normalmente.
2. Se a chamada falhar por erro de conexão (sem resposta do servidor — `err.code === 'ERR_NETWORK'` ou timeout), grava a operação na fila local e atualiza um espelho local dos dados (IndexedDB), retornando um resultado otimista pra UI seguir normalmente.
3. Se a chamada falhar por erro do servidor (validação, 401, etc.), propaga o erro normalmente — isso não é uma falha de conectividade e não deve virar item de fila.

### 4. IndexedDB — estrutura

Usar a lib `idb` (wrapper leve sobre IndexedDB) em vez de IndexedDB puro, por ergonomia e menor risco de bugs de baixo nível.

- **`comandasLocal`**: espelho local das comandas relevantes à sessão atual (abertas). Cada linha tem um ID — real (do servidor) ou temporário (`tmp-<uuid>`) para o que foi criado offline.
- **`filaOperacoes`**: fila ordenada (ordem de criação = ordem de sincronização) de operações pendentes. Cada entrada: `{ id (auto-increment, define a ordem), tipo, payload, dependeDe (id temporário referenciado, se houver), status, criadoEm }`.
- **`caixaLocal`**: espelho do estado do caixa do dia (aberto/fechado, saldo), atualizado otimisticamente.

### 5. Detecção de conexão

Não confiar só em `navigator.onLine` (pode indicar "online" mesmo sem alcançar o backend). Combinar:
- `navigator.onLine` como sinal rápido de mudança de estado.
- Ping periódico leve ao backend (endpoint já existente e barato, ex: `GET /api/cardapio`) para confirmar que a sincronização é segura de iniciar.

### 6. Sincronização

Ao confirmar reconexão real:
1. Processar `filaOperacoes` estritamente em ordem, uma operação de cada vez, aguardando a resposta antes de enviar a próxima.
2. Ao criar uma entidade que tinha ID temporário (ex: comanda), gravar o mapeamento `tmp-id → id real` e usá-lo para resolver o payload de operações subsequentes que dependiam dela (ex: itens daquela comanda).
3. Em caso de sucesso, remover a operação da fila e atualizar o espelho local com os dados reais do servidor.
4. Em caso de falha que não seja de conectividade (validação, conflito, sessão expirada), **pausar a fila** nesse ponto — não pular, não descartar — e expor o erro claramente (ver seção de erros). A fila só volta a processar depois de resolvido.

## UI

- **`principal`**: badge fixo no topo do PDV com 3 estados:
  - Verde — "Online".
  - Amarelo — "Offline — N pendente(s) de sincronização" (tudo funciona normal, só muda a cor).
  - Vermelho — "Erro na sincronização" com detalhe do que falhou, exige atenção.
- **`secundario`/`tablet`**: ao cair a conexão, ações de escrita ficam bloqueadas com "Sem conexão — use o computador principal"; leitura do último estado conhecido continua disponível.
- **Ao reconectar**: sincronização automática e silenciosa; badge mostra "Sincronizando..." e volta a verde ao esvaziar a fila. Sem ação manual necessária no caso comum.
- **Tela de debug** (`/pdv/debug`, sem link visível no menu): mostra o conteúdo cru da fila local, útil para conferência manual nas primeiras semanas de uso.

## Tratamento de erros

| Situação | Comportamento |
|---|---|
| Erro de rede (sem resposta do servidor) | Vira item de fila silenciosamente; usuário não vê erro, a ação "funcionou" localmente. |
| Erro do servidor durante sincronização (validação, conflito) | Pausa a fila inteira nesse ponto; badge vermelho com detalhe; espera decisão manual. |
| Sessão expirada durante sincronização (JWT dura 12h — raro, mas coberto) | Pausa a fila, pede novo login; fila retomada automaticamente após reautenticar. Fila nunca é descartada. |
| App fechado/PC reiniciado com fila pendente | Fila persiste no IndexedDB; retoma sincronização normalmente na próxima abertura com conexão. |

## Testes

- Simular offline via DevTools (Network → Offline): abrir comanda offline → adicionar itens offline → reconectar → conferir dados e valores no backend.
- Testar especificamente finalizar pagamento e fechar caixa offline → reconectar, conferindo que os valores batem (ponto mais sensível — testar múltiplos cenários).
- Conferir bloqueio automático de `secundario`/`tablet` durante queda simulada.
- Conferir que a fila sobrevive a fechar/reabrir o navegador com operações pendentes.

## Fora de escopo

- Sistema de usuários com login individual e papéis — fica para um projeto futuro separado; a marcação de papel do dispositivo é uma flag local simples por enquanto.
- Suporte a mais de um dispositivo escrevendo offline simultaneamente (não é necessário — só o `principal` escreve offline).
- Um servidor local na loja acessível pela rede — não ajuda, já que a rede local cai junto com a internet.
