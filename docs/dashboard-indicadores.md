# Dashboard: definição dos indicadores

**Para:** Vitor · **Situação:** aguardando as decisões · **Tela:** menu Gestão › Dashboard (`/dashboard`)

O Dashboard já está montado no app em versão pré-configurada: 5 seções com 4 cartões cada,
todos marcados "A definir". Falta decidir **quais números entram, como cada um é calculado e
quem vê**. Este arquivo é onde essas decisões ficam registradas.

---

## Como usar (com o Claude)

1. Abra o Claude no repositório `patty-one` e peça:
   > Leia `docs/dashboard-indicadores.md` e me ajude a preencher as decisões do Dashboard.
2. Para cada indicador, responda os campos **Decisão**, **Regra** e **Quem vê** (ou peça ao Claude
   para sugerir). Também dá para pedir indicadores novos na seção "Indicadores novos".
3. Quando terminar, peça:
   > Implemente o Dashboard conforme as decisões de `docs/dashboard-indicadores.md`.

Não precisa saber programar: basta responder em português, do jeito que você explicaria para
alguém da equipe.

---

## Resumo rápido (marque aqui)

Troque `[ ]` por `[x]` no que entra. Os detalhes de cada um estão mais abaixo.

| Seção                 | Código               | Indicador                         | Entra? |
| --------------------- | -------------------- | --------------------------------- | ------ |
| Comercial             | `pedidos-mes`        | Pedidos no mês (R$)               | [ ]    |
| Comercial             | `propostas-abertas`  | Propostas em aberto               | [ ]    |
| Comercial             | `conversao`          | Conversão de propostas (%)        | [ ]    |
| Comercial             | `propostas-vencendo` | Propostas vencendo em 7 dias      | [ ]    |
| Produção e PCP        | `ordens-atrasadas`   | Ordens atrasadas                  | [ ]    |
| Produção e PCP        | `ordens-andamento`   | Ordens em andamento               | [ ]    |
| Produção e PCP        | `servicos-hoje`      | Serviços de hoje                  | [ ]    |
| Produção e PCP        | `nao-realizados`     | Serviços não realizados na semana | [ ]    |
| Projetos e liberações | `projetos-andamento` | Projetos em andamento             | [ ]    |
| Projetos e liberações | `projetos-atrasados` | Projetos atrasados                | [ ]    |
| Projetos e liberações | `bloqueios`          | Bloqueios abertos                 | [ ]    |
| Projetos e liberações | `liberacoes-fila`    | Liberações aguardando o PCP       | [ ]    |
| Mídia OOH             | `ocupacao-bissemana` | Ocupação da bi-semana atual (%)   | [ ]    |
| Mídia OOH             | `faces-livres`       | Faces livres na bi-semana atual   | [ ]    |
| Mídia OOH             | `proxima-bissemana`  | Ocupação da próxima bi-semana (%) | [ ]    |
| Mídia OOH             | `pontos-manutencao`  | Pontos em manutenção              | [ ]    |
| Financeiro            | `receber-vencido`    | A receber vencido (R$)            | [ ]    |
| Financeiro            | `receber-7-dias`     | A receber em 7 dias (R$)          | [ ]    |
| Financeiro            | `pagar-7-dias`       | A pagar em 7 dias (R$)            | [ ]    |
| Financeiro            | `recebido-mes`       | Recebido no mês (R$)              | [ ]    |

---

## Perguntas gerais

Responda logo abaixo de cada pergunta.

1. **Quem abre o Dashboard?** Hoje só Gestão. Outras funções também (Direção, Comercial, PCP…)?
   Cada uma vê só as próprias seções?
   - Resposta:
2. **Ele vira a página inicial?** Hoje o app abre em Projetos.
   - Resposta:
3. **Período padrão:** "mês" é o mês do calendário (1º ao dia 30/31) ou os últimos 30 dias?
   - Resposta:
4. **Comparação:** mostrar a variação contra o mês anterior (ex.: "↑ 12%")?
   - Resposta:
5. **Gráficos:** além dos cartões, quer algum gráfico (ex.: pedidos por mês no último ano,
   ocupação por bi-semana)?
   - Resposta:
6. **Filtro por empresa do grupo:** os números do Comercial e do Financeiro devem poder ser
   separados por empresa?
   - Resposta:

---

## Indicadores propostos

Em cada um: **Decisão** = Entra / Não entra / Entra com mudança. **Regra** = como calcular, se
for diferente da proposta. **Quem vê** = funções (Gestão sempre vê tudo).

### Comercial

#### `pedidos-mes`: Pedidos no mês (cartão de destaque)

- Proposta: soma do valor dos pedidos criados no mês, sem os cancelados.
- Dúvida: contar pela data de criação do pedido ou pela data em que a proposta foi aprovada?
- Decisão:
- Regra:
- Quem vê:

#### `propostas-abertas`: Propostas em aberto

- Proposta: quantidade e valor das propostas em Rascunho ou Enviada.
- Decisão:
- Regra:
- Quem vê:

#### `conversao`: Conversão de propostas

- Proposta: aprovadas ÷ (aprovadas + recusadas) no mês, em %.
- Decisão:
- Regra:
- Quem vê:

#### `propostas-vencendo`: Propostas vencendo

- Proposta: propostas em aberto com validade nos próximos 7 dias (para o vendedor ligar ao cliente).
- Decisão:
- Regra:
- Quem vê:

### Produção e PCP

#### `ordens-atrasadas`: Ordens atrasadas (cartão de destaque)

- Proposta: ordens de produção não concluídas e não canceladas, com data prevista já passada.
- Decisão:
- Regra:
- Quem vê:

#### `ordens-andamento`: Ordens em andamento

- Proposta: ordens com situação Aguardando ou Em andamento.
- Decisão:
- Regra:
- Quem vê:

#### `servicos-hoje`: Serviços de hoje

- Proposta: serviços na Programação Produção de hoje, mostrando "concluídos / total".
- Decisão:
- Regra:
- Quem vê:

#### `nao-realizados`: Não realizados na semana

- Proposta: serviços da semana marcados como Não realizado ou Aguardando equipe.
- Decisão:
- Regra:
- Quem vê:

### Projetos e liberações

#### `projetos-andamento`: Projetos em andamento (cartão de destaque)

- Proposta: projetos ativos (não arquivados) que ainda têm tarefa aberta.
- Decisão:
- Regra:
- Quem vê:

#### `projetos-atrasados`: Projetos atrasados

- Proposta: projetos não concluídos com prazo de entrega já passado.
- Decisão:
- Regra:
- Quem vê:

#### `bloqueios`: Bloqueios abertos

- Proposta: bloqueios registrados nos projetos e ainda não resolvidos.
- Decisão:
- Regra:
- Quem vê:

#### `liberacoes-fila`: Liberações aguardando

- Proposta: liberações na fila do PCP esperando aprovação.
- Decisão:
- Regra:
- Quem vê:

### Mídia OOH

#### `ocupacao-bissemana`: Ocupação da bi-semana (cartão de destaque)

- Proposta: faces Ocupadas ou Reservadas na bi-semana atual ÷ faces dos pontos ativos, em %.
- Dúvida: "Reservado" conta como ocupado, ou mostra os dois separados?
- Decisão:
- Regra:
- Quem vê:

#### `faces-livres`: Faces livres

- Proposta: faces dos pontos ativos sem reserva na bi-semana atual.
- Decisão:
- Regra:
- Quem vê:

#### `proxima-bissemana`: Próxima bi-semana

- Proposta: quanto da próxima bi-semana já está vendido, em %.
- Decisão:
- Regra:
- Quem vê:

#### `pontos-manutencao`: Pontos em manutenção

- Proposta: pontos com situação Em manutenção.
- Decisão:
- Regra:
- Quem vê:

### Financeiro

Hoje só Gestão, Direção e Financeiro veem esta seção (a mesma regra da tela Financeiro).

#### `receber-vencido`: A receber vencido (cartão de destaque)

- Proposta: soma das contas a receber em aberto com vencimento já passado.
- Decisão:
- Regra:
- Quem vê:

#### `receber-7-dias`: A receber em 7 dias

- Proposta: soma das contas a receber em aberto que vencem nos próximos 7 dias.
- Decisão:
- Regra:
- Quem vê:

#### `pagar-7-dias`: A pagar em 7 dias

- Proposta: soma das contas a pagar em aberto, vencidas ou vencendo nos próximos 7 dias.
- Decisão:
- Regra:
- Quem vê:

#### `recebido-mes`: Recebido no mês

- Proposta: total recebido no mês, comparado com o mês anterior.
- Decisão:
- Regra:
- Quem vê:

---

## Indicadores novos

Escreva aqui qualquer número que não está na lista (o Claude ajuda a ver se o dado existe no
sistema).

-

---

## Notas para o Claude (implementação)

Contexto técnico para quem for implementar as decisões acima. Siga também o `AGENTS.md`.

- **Layout e lista de indicadores:** `src/lib/data/dashboard.ts` (`SECOES_DASHBOARD`). Os códigos
  deste documento são os `id` de lá. Indicador recusado: remova da lista. Indicador aprovado:
  tire o `aDefinir` e ligue a uma fonte de dados.
- **Página:** `src/routes/_authenticated/_gestor/dashboard.tsx` (hoje só Gestão, por estar em
  `_gestor`). Se outras funções forem ver, mova a rota para fora de `_gestor`, filtre as seções
  com `secoesVisiveis` e ajuste o item "Dashboard" em `SETORES` (`src/components/app/app-shell.tsx`).
- **Dados:** prefira uma função SQL única `dashboard_resumo()` (`security invoker`, para a RLS de
  cada tabela valer) que devolve um `jsonb` com os totais. A seção Financeiro deve vir `null`
  quando `can_financeiro(auth.uid())` for falso. Leitura no `cloud-*.ts` + hook em
  `src/hooks/use-data.ts`, como o resto do app. A UI nunca consulta o banco direto.
- **Tabelas de origem:** `vendas` + `vendas_itens` (total = Σ(qtd × valor unitário − desconto do
  item) − desconto geral, como em `totaisVenda` de `comercial-rules.ts`); `ordens_producao`
  (`status`, `data_prevista`); `programacao_servicos` (`data`, `status`); `projects` +
  `project_tasks` + `project_blockers` (situação como `projectStatus` de `rules.ts`);
  `liberacoes` (`status = 'aguardando'`); `pontos_midia` (`status`, `faces`) +
  `calendario_bissemanas` + `pontos_ocupacao` (sem linha = Livre); `contas_receber` e
  `contas_pagar` (`status`, `vencimento`, `valor`, `recebido_em`/`pago_em`).
- **Datas:** "hoje" e "mês" no fuso `America/Sao_Paulo`.
- **Migração:** confira o próximo número livre em todas as branches e worktrees
  (`git ls-tree --name-only <branch> drizzle/migrations/`). O SQL é rodado no SQL Editor do
  Supabase antes de subir para a `main` (push na `main` faz deploy).
- **Testes:** regras puras com teste em Vitest; a função SQL com um `tests/db/dashboard.check.sql`.
- Ao terminar, atualize este arquivo (situação de cada indicador) e o `roadmap.md`.
