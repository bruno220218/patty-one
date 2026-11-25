# Fluxo Comercial → Produção → Execução: perguntas

**Para:** Vitor · **Situação:** aguardando as respostas · **Prioridade:** 100% neste fluxo

Hoje o mesmo trabalho pode correr no app por **dois caminhos que não se conversam**. Antes de
juntar os dois, precisamos saber como a Patty trabalha na prática. Este arquivo explica a
situação e traz as perguntas, com espaço para as respostas.

---

## Como usar (com o Claude)

1. Abra o Claude no repositório `patty-one` e peça:
   > Leia `docs/fluxo-producao-perguntas.md` e me ajude a responder as perguntas.
2. Responda do jeito que você explicaria para alguém da equipe. Não precisa saber programar.
   Se não souber alguma, escreva "não sei" ou "tanto faz": também é uma resposta útil.
3. Quando terminar, peça:
   > Monte o plano do fluxo de produção conforme as respostas de `docs/fluxo-producao-perguntas.md`.

---

## Como está hoje

### Caminho 1: o que já existia no Patty One

| Etapa     | Onde no app                         | O que acontece                                                      |
| --------- | ----------------------------------- | ------------------------------------------------------------------- |
| Comercial | Liberações                          | O comercial cria a liberação (cliente, vendedor e itens digitados). |
| Produção  | Liberações (fila do PCP)            | O PCP aprova a liberação, e ela vira um **Projeto** com checklist.  |
| Execução  | Projetos (quadro) e Status Serviços | O PCP marca as tarefas; o comercial acompanha em Status Serviços.   |

### Caminho 2: o que veio do PattyOne

| Etapa     | Onde no app                       | O que acontece                                                    |
| --------- | --------------------------------- | ----------------------------------------------------------------- |
| Comercial | Propostas e pedidos               | A proposta vira **Pedido**, com cadastro do cliente e valores.    |
| Produção  | Ordens de produção                | Do pedido se abre a **Ordem de produção**, com etapas e prazo.    |
| Execução  | Cronograma e Programação Produção | A ordem entra na agenda do dia; a montagem marca o serviço feito. |

### Onde o fluxo quebra

1. **A liberação não está ligada ao pedido.** Cliente e vendedor são digitados de novo, sem
   ligação com o cadastro nem com o valor vendido.
2. **O projeto não está ligado à ordem de produção.** O mesmo trabalho pode ser acompanhado em
   dois lugares, e um não sabe do outro.
3. **O pedido não gera a ordem sozinho.** Alguém precisa lembrar de abrir a ordem a partir do
   pedido.
4. **O comercial só vê o andamento do caminho 1.** Status Serviços mostra os Projetos, mas não
   as ordens nem a Programação.

### Proposta (para comentar)

Um caminho só, começando pelo **Pedido**:

> Pedido → Liberação ligada ao pedido (aprovada pelo PCP) → Ordem de produção →
> Cronograma / Programação → Concluído, visível para o comercial

O Projeto com checklist deixaria de ser um controle separado e passaria a ser só a lista de
etapas da ordem.

---

## Perguntas principais

Responda logo abaixo de cada pergunta.

### 1. O que nasce primeiro: o pedido ou a liberação?

Na prática da Patty, o trabalho começa com a venda fechada (pedido) ou com a liberação? Existe
trabalho que vai para a produção **sem pedido** no sistema (garantia, retrabalho, serviço
interno, urgência)?

- Resposta:

### 2. Qual controle a equipe usa de verdade: Projetos ou Ordens de produção?

Hoje o PCP acompanha a produção pelo quadro de **Projetos** (checklist) ou pelas **Ordens de
produção**? Qual dos dois deve continuar como o controle principal?

- Resposta:

### 3. A ordem de produção deve ser criada automaticamente?

Quando o pedido é fechado, a ordem nasce sozinha (e a liberação vira a aprovação dessa ordem),
ou alguém do PCP cria a ordem à mão?

- Resposta:

---

## Perguntas de apoio

Estas ajudam a fechar os detalhes. Pode pular as que não souber.

### 4. A proposta do caminho único faz sentido?

Concorda com "Pedido → Liberação → Ordem → Programação → Concluído"? Mudaria alguma etapa?

- Resposta:

### 5. Onde entram o briefing e a visita técnica?

Eles acontecem **antes** do pedido (para orçar) ou **depois** (para produzir)? Devem ficar
ligados ao pedido?

- Resposta:

### 6. Um pedido vira uma ordem ou várias?

Um pedido com vários itens (ex.: fachada + adesivos + instalação) gera uma ordem só ou uma
ordem por item ou setor?

- Resposta:

### 7. Quem dá o trabalho por concluído?

A montagem ao terminar a instalação, o PCP ao conferir, ou o comercial ao entregar ao cliente?
O cliente precisa ser avisado?

- Resposta:

### 8. O que o comercial precisa ver do andamento?

Só a etapa atual e o prazo, ou também a data agendada na Programação, a equipe e as fotos do
serviço pronto?

- Resposta:

### 9. E a Mídia OOH (colagens)?

As vendas de mídia (pontos e bi-semanas) passam pelo mesmo caminho até a colagem, ou seguem
separadas?

- Resposta:

---

## Outras observações

Qualquer coisa que não coube nas perguntas.

-

---

## Notas para o Claude (implementação)

Contexto técnico para quem for montar o plano. Siga também o `AGENTS.md`.

- **Caminho 1:** `liberacoes` (texto livre em `cliente`/`vendedor`; `project_id` liga ao projeto
  depois da aprovação; regras no trigger `guard_liberacoes`, migração 0006) → `projects` +
  `project_tasks` (vindas de checklist; RPCs `create_project`/`duplicate_project`) → Status
  Serviços (`/status-servicos`, só leitura, lê o projeto pela `liberacoes.project_id`).
- **Caminho 2:** `vendas` (proposta → pedido por `converter_proposta`, migração 0020) →
  `ordens_producao` (`venda_id` → pedido; etapas em `ordens_producao_etapas`;
  `salvar_ordem_producao`, migração 0019; a tela do pedido abre `/producao/nova?pedido=<id>`) →
  `planejamento_agendamentos` (`ordem_id`) e `programacao_servicos` (`ordem_id`; situação por
  `atualizar_status_programacao`).
- **Não existem hoje:** `liberacoes.venda_id`, `liberacoes.cadastro_id`, ligação projeto ↔ ordem,
  e criação automática da ordem a partir do pedido.
- Trabalhe em etapas pequenas, uma migração por etapa, sem quebrar o que a equipe já usa.
  Sugestão de 1ª etapa: ligar a liberação ao pedido e ao cadastro (colunas opcionais, a liberação
  já existente continua igual).
- Confira o próximo número livre de migração em todas as branches
  (`git ls-tree --name-only <branch> drizzle/migrations/`). O SQL é rodado no SQL Editor do
  Supabase antes de subir para a `main` (push na `main` faz deploy).
- Ao terminar o plano, registre-o no `roadmap.md` e atualize a situação deste arquivo.
