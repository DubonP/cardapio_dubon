# Admin — Área de Cartão

## Contexto

O PDV registra pagamento com "Cartão/Maquininha" de forma genérica (`formaPagamento: MAQUINA`), sem saber qual bandeira nem se foi crédito ou débito — informação que só existe no extrato do banco/operadora. Essa área nova (`/admin/cartao`) é um **livro de lançamento manual e conferência**, separado do PDV: o funcionário digita à mão o valor de cada venda por bandeira+tipo (lendo da maquininha), e o gerente confere contra o banco depois.

## Papéis

Reaproveita o sistema de papéis já existente (`admin`/`funcionario`, `site/admin/src/lib/auth.js`, `isAdmin()`). Aqui chamado de "gerente" = papel `admin`.

| Ação | Funcionário | Gerente |
|---|---|---|
| Ver/adicionar/editar valores de venda | Só últimos 10 dias corridos, e só bandeira+tipo ainda não marcados "correto" | Qualquer dia, sempre, mesmo já marcado "correto" |
| Ver total por bandeira/tipo, total geral, total ao banco | Não | Sim |
| Cadastrar/editar bandeiras e taxas | Não | Sim |
| Marcar dia+bandeira como correto/incorreto | Não | Sim |
| Ver lista de pendências (marcados "incorreto") | Não | Sim |

## Modelo de dados (Prisma)

```prisma
enum TipoCartao { CREDITO DEBITO }
enum StatusConferenciaCartao { PENDENTE CORRETO INCORRETO }

model BandeiraCartao {
  id        Int        @id @default(autoincrement())
  nome      String                      // "Visa", "Master", "Elo", "Amex"...
  tipo      TipoCartao
  taxaAtual Decimal    @db.Decimal(5, 2) // percentual, ex: 2.50
  ativo     Boolean    @default(true)
  ordem     Int        @default(0)
  dias      CartaoDia[]

  @@unique([nome, tipo])
}

model CartaoDia {
  id           Int      @id @default(autoincrement())
  data         DateTime @db.Date
  bandeiraId   Int
  bandeira     BandeiraCartao @relation(fields: [bandeiraId], references: [id])
  taxaAplicada Decimal  @db.Decimal(5, 2)  // taxa da bandeira "congelada" no 1º lançamento do dia
  status       StatusConferenciaCartao @default(PENDENTE)
  vendas       VendaCartao[]

  @@unique([data, bandeiraId])
}

model VendaCartao {
  id          Int       @id @default(autoincrement())
  cartaoDiaId Int
  cartaoDia   CartaoDia @relation(fields: [cartaoDiaId], references: [id], onDelete: Cascade)
  valor       Decimal   @db.Decimal(10, 2)
  criadoEm    DateTime  @default(now())
}
```

**Por que a taxa fica "congelada" por dia (`taxaAplicada`), em vez de sempre usar `BandeiraCartao.taxaAtual`:** confirmado com o dono — mudar a taxa não pode alterar dias já lançados/confirmados no passado. `CartaoDia` só é criado na hora do primeiro lançamento daquele dia+bandeira, copiando a taxa vigente naquele momento; depois disso, mudar `taxaAtual` na bandeira não toca mais nesse `CartaoDia`.

## Rotas (`backend/src/routes/admin/cartao.js`, montada em `/api/admin/cartao`)

Usa o middleware já existente (`authMiddleware` + `requireAdmin` onde for só gerente).

- `GET /bandeiras` — lista bandeiras ativas (os dois papéis).
- `POST /bandeiras`, `PATCH /bandeiras/:id` — criar/editar nome, tipo, taxa, ordem, ativo (**gerente**).
- `GET /dia?data=YYYY-MM-DD` — bandeiras + vendas do dia. Funcionário: bloqueia (403) se `data` fora dos últimos 10 dias corridos; bandeira+tipo com `status=CORRETO` não vem na resposta pra esse papel. Gerente: sempre completo, com totais.
- `POST /dia/:bandeiraId/vendas?data=YYYY-MM-DD` — adiciona um valor (cria o `CartaoDia` se ainda não existir, congelando a taxa). Bloqueado (403) pro funcionário fora da janela de 10 dias ou se já `CORRETO`.
- `PATCH /vendas/:id`, `DELETE /vendas/:id` — editar/remover um lançamento, mesma regra de acesso acima.
- `PATCH /dia/:bandeiraId/status?data=YYYY-MM-DD` — marcar `CORRETO`/`INCORRETO`/`PENDENTE` (**gerente**).
- `GET /pendencias` — todos os `CartaoDia` com status `INCORRETO`, qualquer data (**gerente**).

**Decisão que tomei sem perguntar, sinaliza se quiser diferente:** o funcionário pode remover (`DELETE`) um lançamento que ele mesmo acabou de adicionar por engano, não só editar — achei mais natural que forçar edição pra "desfazer" um campo extra criado sem querer.

## Tela (`site/admin/src/pages/Cartao.jsx`, rota `/cartao`)

- **Topo:** dia do mês + dia da semana, bem grande. Setas pra navegar entre dias — funcionário travado nos últimos 10 dias corridos, gerente sem limite.
- **[Só gerente] Bloco de bandeiras/taxas:** lista de bandeiras com taxa editável, botão pra adicionar bandeira nova (nome + tipo + taxa).
- **[Só gerente] Pendências:** lista de bandeira+dia marcados "incorreto", linkando direto pro dia.
- **Grade principal:** 7 colunas lado a lado (uma por bandeira+tipo ativo), cada uma com a lista de valores já lançados naquele dia + um campo vazio no fim pra lançar o próximo (some da tela do funcionário se já estiver "correto" nesse dia).
- **[Só gerente] Por coluna:** total do dia + botão correto/incorreto.
- **[Só gerente] Rodapé:** total geral do dia, total de taxa, total líquido a receber no banco.

## Dados iniciais

Ao rodar a migração, já cadastra as 7 combinações que o dono passou (taxa inicial 0, ele ajusta depois pela tela): Visa Crédito, Visa Débito, Master Crédito, Master Débito, Elo Crédito, Elo Débito, Amex Crédito.

## Fora de escopo

- Qualquer ligação automática com os pagamentos "MAQUINA" já registrados no PDV — é lançamento manual, independente.
- Conferência automática contra extrato bancário (upload de arquivo, etc.) — só o marcar manual correto/incorreto.
