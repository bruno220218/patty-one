# Fluxo Comercial → Produção → Execução: perguntas

**Para:** Vitor · **Situação:** respondido em 25/11/2026; plano em `docs/fluxo-producao-plano.md` (26/11/2026) · **Prioridade:** 100% neste fluxo

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

- Resposta: Normalmente começa pelo **pedido**, mas às vezes vai trabalho para a produção
  **sem pedido** (garantia, retrabalho, serviço interno, urgência).
  - Consequência: o caminho único precisa aceitar uma liberação/ordem sem pedido, com um
    motivo obrigatório (Garantia, Retrabalho, Interno, Urgência). No caso de urgência, o pedido
    deve poder ser ligado depois.

### 2. Qual controle a equipe usa de verdade: Projetos ou Ordens de produção?

Hoje o PCP acompanha a produção pelo quadro de **Projetos** (checklist) ou pelas **Ordens de
produção**? Qual dos dois deve continuar como o controle principal?

- Resposta: Hoje a equipe usa **os dois**. Como controle principal: a **Ordem de produção**
  (ver resposta 4). O checklist do Projeto passa a ser a lista de etapas da ordem.
  - Complemento: às vezes a ordem é um **serviço feito internamente**, sem pedido e até sem
    orçamento. Isso reforça a resposta 1: a ordem precisa poder ser aberta à mão pelo PCP,
    sem pedido, com o motivo "Interno".

### 3. A ordem de produção deve ser criada automaticamente?

Quando o pedido é fechado, a ordem nasce sozinha (e a liberação vira a aprovação dessa ordem),
ou alguém do PCP cria a ordem à mão?

- Resposta: **Automática.** O pedido fechado já gera as ordens, e a liberação vira a aprovação
  delas pelo PCP.

---

## Perguntas de apoio

Estas ajudam a fechar os detalhes. Pode pular as que não souber.

### 4. A proposta do caminho único faz sentido?

Concorda com "Pedido → Liberação → Ordem → Programação → Concluído"? Mudaria alguma etapa?

- Resposta: **Sim, como está.** O Projeto deixa de ser um controle separado.

### 5. Onde entram o briefing e a visita técnica?

Eles acontecem **antes** do pedido (para orçar) ou **depois** (para produzir)? Devem ficar
ligados ao pedido?

- Resposta: **Depende do serviço.** Às vezes é antes (para orçar), às vezes depois (para
  produzir).
  - Consequência: o briefing e a visita podem ficar ligados à proposta/pedido **ou** à ordem.
    Quando foram feitos antes, ficam visíveis também na ordem.

### 6. Um pedido vira uma ordem ou várias?

Um pedido com vários itens (ex.: fachada + adesivos + instalação) gera uma ordem só ou uma
ordem por item ou setor?

- Resposta: **Uma ordem por item do pedido.**
  - Consequência (com a resposta 3): ao fechar o pedido, nasce uma ordem para cada item.
  - Itens como **frete** não geram ordem própria. Ficam junto com as ordens do pedido.
  - **Uma liberação por pedido.** Ela aprova de uma vez todas as ordens daquele pedido.

### 7. Quem dá o trabalho por concluído?

A montagem ao terminar a instalação, o PCP ao conferir, ou o comercial ao entregar ao cliente?
O cliente precisa ser avisado?

- Resposta: **O PCP, ao conferir.** A montagem marca o serviço como feito na Programação, e o
  PCP confirma a conclusão.
  - **O cliente precisa ser avisado e confirmar o serviço pronto.** Sequência: montagem marca
    feito → PCP confere → cliente é avisado → cliente confirma → Concluído.
  - (Sugestão do Claude, ainda não confirmada) Quem avisa é o comercial, e ele registra no app
    a confirmação do cliente.

### 8. O que o comercial precisa ver do andamento?

Só a etapa atual e o prazo, ou também a data agendada na Programação, a equipe e as fotos do
serviço pronto?

- Resposta: O comercial **vê o andamento, sem editar.** O que aparece: etapa atual, prazo,
  data agendada na Programação, equipe e fotos do serviço pronto. A única ação dele é
  registrar a confirmação do cliente (resposta 7).

### 9. E a Mídia OOH (colagens)?

As vendas de mídia (pontos e bi-semanas) passam pelo mesmo caminho até a colagem, ou seguem
separadas?

- Resposta: **Mesmo caminho.** Venda de mídia → liberação → ordem → Programação da colagem.

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
