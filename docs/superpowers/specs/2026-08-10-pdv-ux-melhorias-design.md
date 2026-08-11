# PDV — melhorias de UX e fluxo

## Contexto

Seis melhorias pedidas pelo dono pra agilizar o atendimento no balcão (`site/pdv/`), reduzindo cliques/mouse e deixando mais claro qual cliente está sendo atendido. Antes de desenhar, foi levantado o impacto entre projetos (site do cliente, admin, relatórios), já que valores e produtos vendidos alimentam outros controles.

## Pesquisa que embasa as decisões

- `ItemPedidoBalcao` (item de comanda do PDV) **não tem vínculo de banco com `Produto`** — só grava `descricao` (texto livre), `categoriaId` opcional, preço e quantidade. Não há risco de integridade referencial em mudar o que vira `descricao`.
- Pote e Bebida: todos os produtos (sabores) têm `preco: null` — o preço vem sempre de `categoria.precosPorQuantidade`, igual pra todo sabor da mesma categoria/tamanho. Remover a escolha do sabor não muda nenhum valor.
- O relatório de produtos do admin (`backend/src/routes/admin/relatorios.js:103`) **já agrupa por categoria, não por sabor** (comentário no próprio código confirma). Não precisa mudar nada lá.
- Casquinha é diferente: produtos com preços genuinamente diferentes entre si (casquinha avulsa R$0,30 vs. pacote de 10 R$8,00) — não é "sabor", é produto — **fica fora do escopo**, mantém seleção.
- Taça (Milk-shake): só 1 produto cadastrado, o "sabor" hoje é um campo de texto livre opcional que vira sufixo da descrição — mecanismo já diferente do resto, **fica como está** (dono confirmou que esse texto não precisa aparecer nos relatórios de venda, e como o relatório agrupa por categoria, já não aparece mesmo).
- Site do cliente (`site/index.html`) **não muda** — o cliente final continua escolhendo sabor no pedido pela internet, porque isso importa pra quem vai preparar/entregar. Só o controle de vendas não usa mais o sabor.

## 1. Remover escolha de sabor — Pote e Bebida

Hoje (`Comanda.jsx`, componente `QuickAddModal`), categorias com produtos (`temProdutos`) obrigam escolher um sabor de uma lista antes de poder adicionar. Pote e Bebida passam a funcionar **igual ao Picolé**: escolher a categoria já mostra só o campo de quantidade (foco automático — as setas ↑/↓ do teclado já incrementam/decrementam nativamente num `<input type="number">` focado), Enter adiciona.

- `descricao` do item passa a ser `cat.nome` (ex: "Linha Industrial 2 Litros") em vez do nome do sabor.
- Preço vem de `resolverFaixaPreco(cat.precosPorQuantidade, 1)`, igual ao Picolé/fallback já fazem hoje.
- Critério de quais categorias simplificam: `temProdutos && !isTaca && !isCasquinha` (ou seja, tudo que tem produto exceto Taça e Casquinha — cobre Pote e Bebida hoje, e qualquer categoria nova desse formato no futuro).
- Casquinha e Taça continuam exatamente como funcionam hoje.

## 2. Navegação por teclado dentro do PDV

Objetivo: dar pra atender um balcão inteiro sem tocar no mouse. Só dentro do PDV (não no site do cliente).

**Tela de pagamento** (`PagamentoModal`, etapa "escolha"): ↑/↓ percorre Dinheiro → Cartão → Pix → Notinha (começa em Dinheiro), Enter confirma a opção destacada — mesmo efeito de clicar nela. As etapas de troco/notinha já respondem a Enter no campo, sem mudança.

**Dentro de uma comanda** (`Comanda.jsx`): um "foco" navegável por ↓/↑ passa por, nessa ordem:
1. Nome do cliente (ver item 6)
2. Categorias de produto, uma por uma na ordem em que aparecem na tela (não em grade — ↓ sempre avança pra próxima, ↑ volta)
3. Botão Cancelar / Finalizar

Enter ativa o que estiver em foco (abre a categoria escolhida, entra em edição do nome, ou finaliza/cancela). ←/→ trocam para a comanda anterior/próxima da lista de comandas abertas (equivalente a clicar noutra comanda na sidebar) — funciona a qualquer momento, não só quando o foco está numa borda.

Esc sempre fecha modal aberto, igual já funciona hoje no `QuickAddModal`.

## 3 e 6. Nome do cliente em destaque + cor da comanda atual

- Nome do cliente aparece grande no topo da comanda (`Comanda.jsx`, header), no lugar do ícone de lápis atual.
- Alcançável pela navegação do item 2; Enter ou clique nele entra em edição com o texto já todo selecionado (troca rápida sem apagar letra por letra).
- Fontes maiores em geral no PDV (itens, valores, botões).
- Destaque de cor mais forte no header da comanda aberta na tela agora, pra ficar óbvio qual cliente está sendo atendido — sem mudar a cor de cada comanda na lista/sidebar (só a que está aberta ganha o destaque).

## 4. Data também na tela da comanda

`PDV.jsx` já mostra a data no topo da lista principal. Mesmo formato passa a aparecer também no header de `Comanda.jsx` (tela de dentro de uma comanda específica). Sem relógio vivo, só a data — como já é hoje na tela principal.

## 5. Comanda reserva sempre disponível

Hoje, ao finalizar/cancelar a última comanda aberta, o sistema cria uma nova comanda vazia sem nome automaticamente (`navegarProximaComanda`). Isso já existe parcialmente — a mudança é:

- Sempre existe **uma e só uma** comanda vazia/sem nome disponível na lista enquanto o caixa está aberto (criada ao abrir o caixa, se ainda não existir nenhuma).
- No instante em que essa comanda reserva recebe **qualquer ação** — um nome (item 6) ou o primeiro produto — uma **nova** comanda reserva vazia é criada na hora, pra sempre ter uma pronta.
- O botão manual "+ Nova Comanda" é removido (fica redundante — a reserva sempre existe e está na lista).

Isso precisa entrar na camada offline (`operations.js`/`sync.js`) do mesmo jeito que as outras mutações — criar a reserva é só mais um `criarComanda()`, então já herda fila/otimismo/sincronização por comanda que já existe.

## Fora de escopo

- Site do cliente (`site/index.html`) — mantém seleção de sabor no pedido.
- Casquinha e Taça no PDV — mantêm o mecanismo atual.
- Relatórios do admin — já agrupam por categoria, não precisam mudar.
- Remover item já adicionado à comanda continua só por clique (não entra na navegação por seta) — o pedido original foi sobre percorrer categorias até o pagamento, não sobre editar itens já lançados.
