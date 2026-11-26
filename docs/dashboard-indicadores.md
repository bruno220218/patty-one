# Dashboard: definição dos indicadores

**Para:** Vitor · **Situação:** implementado em 26/11/2026 (migração 0037) · **Tela:** menu Visão geral › Dashboard (`/dashboard`)

Este arquivo registra **quais números entram no Dashboard, como cada um é calculado e quem vê**.
Os 20 indicadores abaixo estão no ar desde 26/11/2026. Para mudar algum, edite a decisão aqui e
peça ao Claude para aplicar.

**Detalhes que a implementação precisou fixar** (diga se algum deve ser diferente):

- **Ordens atrasadas** contam também as que estão "Aguardando liberação" com a data prevista já
  passada. **Ordens em andamento** não contam essas, porque ainda não entraram na produção.
- **Bloqueios abertos** contam só os de projetos não arquivados.
- **Mídia OOH:** a ocupação é marcada por ponto, então todas as faces do ponto contam juntas
  (um ponto de 2 faces ocupado = 2 faces ocupadas).
- **Conversão:** a variação contra o mês anterior aparece em pontos percentuais (ex.: "↑ 5 p.p.").
  Sem decisões em um dos dois meses, ela não aparece.
- **Variação em %** (pedidos e recebido): se o mesmo trecho do mês anterior deu zero, ela não aparece.
- Os números se atualizam sozinhos a cada 5 minutos com a página aberta.

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

## Pendências (resolvidas em 26/11/2026)

1. **Filtro por empresa do grupo:** fica para a 2ª versão. A 1ª mostra os números do grupo todo.
   No código, `vendas.empresa_id` é obrigatório, mas `contas_receber.empresa_id` e
   `contas_pagar.empresa_id` são opcionais, então algumas contas podem estar sem empresa.
2. **Função "Mídia":** não existe no app. A seção Mídia OOH fica para Gestão, Direção e Comercial.
3. **`pedidos-mes`:** confirmado. O pedido nasce na mesma operação que aprova a proposta
   (`converter_proposta`), então a data de criação do pedido é a data da aprovação.
4. **Data da decisão da proposta** (para a `conversao`): as propostas não guardavam essa data.
   Decisão: criar a coluna `vendas.decidida_em`, preenchida sozinha quando a proposta passa a
   Aprovada ou Recusada. Nas propostas antigas, as aprovadas usam a data de criação do pedido gerado
   e as recusadas usam `updated_at`.
5. **Ordem:** o Dashboard ficou com a migração 0037 (o fluxo de produção segue a partir da 0038).

---

## Resumo rápido (marque aqui)

Troque `[ ]` por `[x]` no que entra. Os detalhes de cada um estão mais abaixo.

| Seção | Código | Indicador | Entra? |
|---|---|---|---|
| Comercial | `pedidos-mes` | Pedidos no mês (R$) | [x] |
| Comercial | `propostas-abertas` | Propostas em aberto | [x] |
| Comercial | `conversao` | Conversão de propostas (%) | [x] com mudança |
| Comercial | `propostas-vencendo` | Propostas vencendo em 7 dias | [x] |
| Produção e PCP | `ordens-atrasadas` | Ordens atrasadas | [x] |
| Produção e PCP | `ordens-andamento` | Ordens em andamento | [x] com mudança |
| Produção e PCP | `servicos-hoje` | Serviços de hoje | [x] |
| Produção e PCP | `nao-realizados` | Serviços não realizados na semana | [x] |
| Projetos e liberações | `projetos-andamento` | Projetos em andamento | [x] |
| Projetos e liberações | `projetos-atrasados` | Projetos atrasados | [x] |
| Projetos e liberações | `bloqueios` | Bloqueios abertos | [x] |
| Projetos e liberações | `liberacoes-fila` | Liberações aguardando o PCP | [x] com mudança |
| Mídia OOH | `ocupacao-bissemana` | Ocupação da bi-semana atual (%) | [x] com mudança |
| Mídia OOH | `faces-livres` | Faces livres na bi-semana atual | [x] |
| Mídia OOH | `proxima-bissemana` | Ocupação da próxima bi-semana (%) | [x] |
| Mídia OOH | `pontos-manutencao` | Pontos em manutenção | [x] |
| Financeiro | `receber-vencido` | A receber vencido (R$) | [x] |
| Financeiro | `receber-7-dias` | A receber em 7 dias (R$) | [x] |
| Financeiro | `pagar-7-dias` | A pagar em 7 dias (R$) | [x] com mudança |
| Financeiro | `recebido-mes` | Recebido no mês (R$) | [x] |

---

## Perguntas gerais

Responda logo abaixo de cada pergunta.

1. **Quem abre o Dashboard?** Hoje só Gestão. Outras funções também (Direção, Comercial, PCP…)?
   Cada uma vê só as próprias seções?
   - Resposta: Cada função vê só as suas seções. Gestão e Direção veem tudo. Comercial vê
     Comercial e Mídia OOH. PCP vê Produção e PCP e também Projetos e liberações. Financeiro vê
     Financeiro. Não existe função Mídia (ver Pendências). Uma função sem nenhuma
     seção não vê o item "Dashboard" no menu.
2. **Ele vira a página inicial?** Hoje o app abre em Projetos.
   - Resposta: Sim, só para Gestão e Direção. As outras funções continuam abrindo em Projetos.
3. **Período padrão:** "mês" é o mês do calendário (1º ao dia 30/31) ou os últimos 30 dias?
   - Resposta: Mês do calendário, do dia 1º até hoje.
4. **Comparação:** mostrar a variação contra o mês anterior (ex.: "↑ 12%")?
   - Resposta: Sim, nos cartões de valor do mês (`pedidos-mes`, `recebido-mes`) e na `conversao`.
     A comparação é com o mesmo trecho do mês anterior (ex.: 1º a 26/11 contra 1º a 26/10), para o
     começo do mês não parecer sempre uma queda. Os outros cartões mostram a situação de agora e
     ficam sem comparação.
5. **Gráficos:** além dos cartões, quer algum gráfico (ex.: pedidos por mês no último ano,
   ocupação por bi-semana)?
   - Resposta: Nenhum na primeira versão, só os cartões. Para depois: pedidos por mês nos últimos
     12 meses e ocupação das próximas 6 bi-semanas.
6. **Filtro por empresa do grupo:** os números do Comercial e do Financeiro devem poder ser
   separados por empresa?
   - Resposta: Na 2ª versão. A 1ª mostra o grupo todo (ver Pendências).

---

## Indicadores propostos

Em cada um: **Decisão** = Entra / Não entra / Entra com mudança. **Regra** = como calcular, se
for diferente da proposta. **Quem vê** = funções (Gestão sempre vê tudo).

### Comercial

#### `pedidos-mes`: Pedidos no mês (cartão de destaque)
- Proposta: soma do valor dos pedidos criados no mês, sem os cancelados.
- Dúvida: contar pela data de criação do pedido ou pela data em que a proposta foi aprovada?
- Decisão: Entra
- Regra: Como na proposta, pela data de criação do pedido (é a data da aprovação, ver Pendências). Mostrar
  também a quantidade de pedidos e a variação contra o mesmo trecho do mês anterior.
- Quem vê: Direção, Comercial

#### `propostas-abertas`: Propostas em aberto
- Proposta: quantidade e valor das propostas em Rascunho ou Enviada.
- Decisão: Entra
- Regra: Como na proposta.
- Quem vê: Direção, Comercial

#### `conversao`: Conversão de propostas
- Proposta: aprovadas ÷ (aprovadas + recusadas) no mês, em %.
- Decisão: Entra com mudança
- Regra: Contar pela data em que a proposta foi aprovada ou recusada (não pela data de criação).
  Mostrar também os números por trás do % (ex.: "12 de 20"), porque com poucas propostas o % oscila muito.
  Se nenhuma proposta foi decidida no mês, mostrar "—".
- Quem vê: Direção, Comercial

#### `propostas-vencendo`: Propostas vencendo
- Proposta: propostas em aberto com validade nos próximos 7 dias (para o vendedor ligar ao cliente).
- Decisão: Entra
- Regra: Como na proposta, com validade entre hoje e hoje + 7 dias. Clicar no cartão abre a lista
  dessas propostas.
- Quem vê: Direção, Comercial

### Produção e PCP

#### `ordens-atrasadas`: Ordens atrasadas (cartão de destaque)
- Proposta: ordens de produção não concluídas e não canceladas, com data prevista já passada.
- Decisão: Entra
- Regra: Como na proposta. Uma ordem com data prevista igual a hoje ainda não conta como atrasada.
- Quem vê: Direção, PCP

#### `ordens-andamento`: Ordens em andamento
- Proposta: ordens com situação Aguardando ou Em andamento.
- Decisão: Entra com mudança
- Regra: O total como na proposta, com o detalhe embaixo: "X aguardando · Y em andamento".
- Quem vê: Direção, PCP

#### `servicos-hoje`: Serviços de hoje
- Proposta: serviços na Programação Produção de hoje, mostrando "concluídos / total".
- Decisão: Entra
- Regra: Como na proposta.
- Quem vê: Direção, PCP

#### `nao-realizados`: Não realizados na semana
- Proposta: serviços da semana marcados como Não realizado ou Aguardando equipe.
- Decisão: Entra
- Regra: Semana = de segunda a domingo da semana atual.
- Quem vê: Direção, PCP

### Projetos e liberações

#### `projetos-andamento`: Projetos em andamento (cartão de destaque)
- Proposta: projetos ativos (não arquivados) que ainda têm tarefa aberta.
- Decisão: Entra
- Regra: Como na proposta.
- Quem vê: Direção, PCP

#### `projetos-atrasados`: Projetos atrasados
- Proposta: projetos não concluídos com prazo de entrega já passado.
- Decisão: Entra
- Regra: Como na proposta.
- Quem vê: Direção, PCP

#### `bloqueios`: Bloqueios abertos
- Proposta: bloqueios registrados nos projetos e ainda não resolvidos.
- Decisão: Entra
- Regra: Como na proposta.
- Quem vê: Direção, PCP

#### `liberacoes-fila`: Liberações aguardando
- Proposta: liberações na fila do PCP esperando aprovação.
- Decisão: Entra com mudança
- Regra: A quantidade como na proposta, e embaixo há quanto tempo espera a mais antiga
  (ex.: "a mais antiga há 3 dias").
- Quem vê: Direção, PCP

### Mídia OOH

#### `ocupacao-bissemana`: Ocupação da bi-semana (cartão de destaque)
- Proposta: faces Ocupadas ou Reservadas na bi-semana atual ÷ faces dos pontos ativos, em %.
- Dúvida: "Reservado" conta como ocupado, ou mostra os dois separados?
- Decisão: Entra com mudança
- Regra: Reservado conta como ocupado no %. Embaixo aparece o detalhe: "X ocupadas · Y reservadas".
- Quem vê: Direção, Comercial

#### `faces-livres`: Faces livres
- Proposta: faces dos pontos ativos sem reserva na bi-semana atual.
- Decisão: Entra
- Regra: Como na proposta. Pontos em manutenção não contam como livres.
- Quem vê: Direção, Comercial

#### `proxima-bissemana`: Próxima bi-semana
- Proposta: quanto da próxima bi-semana já está vendido, em %.
- Decisão: Entra
- Regra: A mesma conta da `ocupacao-bissemana` (ocupadas + reservadas, com detalhe), aplicada à
  próxima bi-semana do calendário.
- Quem vê: Direção, Comercial

#### `pontos-manutencao`: Pontos em manutenção
- Proposta: pontos com situação Em manutenção.
- Decisão: Entra
- Regra: Como na proposta.
- Quem vê: Direção, Comercial

### Financeiro

Hoje só Gestão, Direção e Financeiro veem esta seção (a mesma regra da tela Financeiro).

#### `receber-vencido`: A receber vencido (cartão de destaque)
- Proposta: soma das contas a receber em aberto com vencimento já passado.
- Decisão: Entra
- Regra: Como na proposta, mostrando também a quantidade de contas.
- Quem vê: Direção, Financeiro

#### `receber-7-dias`: A receber em 7 dias
- Proposta: soma das contas a receber em aberto que vencem nos próximos 7 dias.
- Decisão: Entra
- Regra: Vencimento entre hoje e hoje + 7 dias.
- Quem vê: Direção, Financeiro

#### `pagar-7-dias`: A pagar em 7 dias
- Proposta: soma das contas a pagar em aberto, vencidas ou vencendo nos próximos 7 dias.
- Decisão: Entra com mudança
- Regra: O total como na proposta, com o detalhe embaixo: "R$ X já vencido · R$ Y nos próximos 7 dias".
- Quem vê: Direção, Financeiro

#### `recebido-mes`: Recebido no mês
- Proposta: total recebido no mês, comparado com o mês anterior.
- Decisão: Entra
- Regra: Soma pela data em que o valor foi recebido (`recebido_em`), comparada com o mesmo trecho do
  mês anterior.
- Quem vê: Direção, Financeiro

---

## Indicadores novos

Escreva aqui qualquer número que não está na lista (o Claude ajuda a ver se o dado existe no
sistema).

- (nenhum por enquanto)

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
- **Decorrentes das decisões acima:**
  - Página inicial: redirecionar para `/dashboard` só Gestão e Direção; os demais seguem em Projetos.
  - Comparação "mesmo trecho do mês anterior": do dia 1º até o mesmo dia do mês anterior, limitado
    ao último dia daquele mês (ex.: 31/03 compara com 1º–28/02 ou 29/02).
  - `conversao` usa a nova `vendas.decidida_em` (ver Pendências 4); `recebido-mes` usa
    `contas_receber.recebido_em`, que já existe.
  - Cartões com detalhe (ordens, liberações, OOH, a pagar): devolva os componentes separados no
    `jsonb`, não só o total.
