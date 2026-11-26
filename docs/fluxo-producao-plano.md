# Fluxo Comercial → Produção → Execução: plano

**Base:** respostas do Vitor em `docs/fluxo-producao-perguntas.md` (25/11/2026) ·
**Montado em:** 26/11/2026 · **Situação:** plano pronto; 5 pontos esperam confirmação (abaixo)

## O caminho único

```
Pedido ──► Liberação (1 por pedido, PCP aprova) ──► Ordens (1 por item) ──► Cronograma / Programação
                                                                                    │
  Concluída ◄── cliente confirma ◄── comercial avisa ◄── PCP confere ◄── montagem marca "feito"
```

- Trabalho **sem pedido** (Garantia, Retrabalho, Interno, Urgência): o PCP abre a ordem à mão,
  com o motivo obrigatório. Na Urgência, o pedido pode ser ligado depois.
- O **Projeto com checklist** deixa de ser um controle separado: o checklist vira a lista de
  etapas da ordem.
- **Mídia OOH** segue o mesmo caminho: o item de mídia vira uma ordem de colagem.
- O **comercial** acompanha tudo sem editar. A única ação dele é registrar a confirmação do
  cliente.

## Etapas (uma migração por etapa, a partir da 0032)

Cada etapa entra em produção sozinha e não quebra o que a equipe usa hoje. Liberações e
projetos já abertos terminam no caminho antigo.

| #   | Etapa                                         | Migração | O que muda para a equipe                                                                                                           |
| --- | --------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Liberação ligada ao pedido e ao cadastro      | 0032     | No pedido, botão "Liberar para produção": a liberação nasce preenchida (cliente, vendedor, itens). Uma por pedido.                 |
| 2   | Itens do pedido com identidade fixa           | 0033     | Nada visível. Prepara "uma ordem por item" (ver nota técnica 1).                                                                   |
| 3   | Ordens automáticas                            | 0034     | Ao criar a liberação, nasce uma ordem por item ("Aguardando liberação"). O PCP aprova a liberação e as ordens vão para a fila.     |
| 4   | Ordem sem pedido, com motivo                  | 0034     | Em Ordens de produção, "Nova ordem" pede o motivo quando não há pedido. Urgência ganha "Ligar pedido".                             |
| 5   | Etapas da ordem a partir do checklist         | 0035     | As etapas da ordem vêm de um checklist, com as regras do Projeto: quem marcou e quando, só gestão desmarca, parâmetros fixos.      |
| 6   | Conclusão com conferência e cliente           | 0036     | Montagem marca feito → ordem "Aguardando conferência" → PCP confere → comercial avisa o cliente e registra a confirmação → Concluída. |
| 7   | Status Serviços lendo as ordens               | —        | O comercial vê etapa, prazo, data na Programação, equipe e fotos. Projetos antigos continuam aparecendo até terminarem.            |
| 8   | Briefing e visita ligados ao pedido ou à ordem | 0037     | Briefing e visita técnica ganham "pedido" ou "ordem" (opcionais). Os feitos antes do pedido aparecem também na ordem.             |
| 9   | Mídia OOH: ordem de colagem                   | 0038     | O item de mídia gera uma ordem do tipo "Colagem" com ponto e bi-semana, que entra na Programação.                                  |

Os números de migração são uma previsão: confira o próximo número livre em todas as branches
antes de cada etapa.

## Pontos para confirmar com o Vitor

As respostas deixam estes detalhes em aberto. Entre parênteses, o que o plano assume se ninguém
disser outra coisa.

1. **Quando o pedido está "fechado"?** O pedido não tem situação "fechado".
   (Assumido: é quando o comercial aperta "Liberar para produção" no pedido. Um pedido salvo
   ainda pode ser corrigido antes disso.)
2. **Quais itens geram ordem?** O frete não gera. (Assumido: Mídia OOH, Produção e Serviço geram;
   Item livre não gera, mas cada item tem uma caixa "gera ordem" que o comercial pode mudar.)
3. **Qual checklist vira as etapas da ordem?** (Assumido: cada produto/serviço do catálogo pode ter
   um checklist padrão; o PCP pode trocar ao aprovar a liberação.)
4. **Quem registra a confirmação do cliente?** (Assumido: o comercial, no app, com a data e quem
   registrou. Sugestão do Claude ainda não confirmada na resposta 7.)
5. **Pedido alterado depois da liberação.** (Assumido: depois de liberado, mudar itens do pedido
   exige reprovar/reabrir a liberação, como hoje.)

## Notas técnicas (para o Claude)

1. `salvar_venda` (0020) apaga e recria os itens a cada gravação, então o id do item muda. Antes
   de ligar a ordem ao item (`ordens_producao.venda_item_id`), a etapa 2 troca isso por
   atualizar/inserir/apagar por id. Itens com ordem não podem ser apagados (`on delete restrict`).
2. Etapa 1: `liberacoes.venda_id` (único quando preenchido) e `liberacoes.cadastro_id`, opcionais;
   `guard_liberacoes` continua mandando no fluxo. Liberação sem pedido exige
   `motivo_sem_pedido in ('Garantia','Retrabalho','Interno','Urgência')`.
3. Etapa 3: novo status de ordem `Aguardando liberação`; criação das ordens em função
   security definer chamada pelo gatilho da liberação (o comercial não tem `can_gerir_operacao`).
   Reprovar a liberação devolve as ordens para `Aguardando liberação`; cancelar o pedido cancela
   as ordens que não começaram.
4. Etapa 3: a aprovação deixa de criar Projeto para liberações ligadas a pedido; as antigas não
   mudam. `ordens_producao.liberacao_id` liga a ordem à liberação.
5. Etapa 5: copie a lógica de `create_project` / `guard_project_tasks` para
   `ordens_producao_etapas` (colunas `concluido_por`, trava de parâmetros fixos, só gestão
   desmarca) e cubra com um `tests/db/*.check.sql`, como em `task-rules.check.sql`.
6. Etapa 6: novos status `Aguardando conferência` e `Aguardando cliente`; quando a Programação
   marca `Concluído` em todos os serviços da ordem, ela passa a `Aguardando conferência`. Avisos
   por `avisar()`. Quando todas as ordens do pedido estão Concluídas, o pedido vira `Concluído`.
7. Etapa 9: `ordens_producao.tipo` ganha `Colagem`; a ordem guarda `ponto_id` e a bi-semana do item.
8. Cada etapa: SQL testado no PGlite, rodado no SQL Editor do Supabase antes da `main`,
   `types.ts` regenerado e `AGENTS.md` atualizado.
