# Fluxo Comercial → Produção → Execução: plano

**Base:** respostas do Vitor em `docs/fluxo-producao-perguntas.md` (25/11/2026) e decisões dos
pontos em aberto (26/11/2026) · **Situação:** plano fechado, pronto para a etapa 1

## O caminho único

```
Aceite do cliente ──► Pedido ──► Solicitar prazo ──► PCP dá o prazo ──► Liberação (1 por pedido)
                                  (IA sugere, PCP decide)                         │
                                                                                  ▼
  Concluída ◄── cliente confirma ◄── comercial avisa ◄── PCP confere ◄── Ordens (1 por item) ──► Programação
                (comercial registra)                                    montagem marca "feito"
```

- O comercial recebe o aceite do cliente, **solicita o prazo** ao PCP pelo app e, com o prazo
  dado, faz a liberação.
- Uma **IA ajuda o PCP** a escolher o prazo. Ela olha a carga de trabalho (ordens abertas,
  Cronograma, Programação) e avisa quando um prazo é impossível de cumprir ou longo demais. Quem
  decide é sempre o PCP.
- **Todos os itens do pedido geram ordem.** Se for preciso, isso muda depois.
- Trabalho **sem pedido** (Garantia, Retrabalho, Interno, Urgência): o PCP abre a ordem à mão,
  com o motivo obrigatório. Na Urgência, o pedido pode ser ligado depois.
- O **checklist** que o Projeto usa hoje vira a lista de etapas da ordem (os mesmos checklists
  de Gestão › Checklists).
- **Mudança depois da liberação:** o pedido continua editável. Cada mudança fica registrada na
  liberação, como um comentário automático que diz o que mudou, e o PCP recebe um aviso.
- O **comercial** acompanha sem editar. Ele registra a confirmação do cliente.
- **Mídia OOH** segue o mesmo caminho: o item de mídia vira uma ordem de colagem.

## Etapas (uma migração por etapa, a partir da 0032)

Cada etapa entra em produção sozinha e não quebra o que a equipe usa hoje. Liberações e
projetos já abertos terminam no caminho antigo.

| #   | Etapa                                          | Migração | O que muda para a equipe                                                                                                            |
| --- | ---------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Liberação ligada ao pedido e ao cadastro       | 0032     | No pedido, botão "Liberar para produção": a liberação nasce preenchida (cliente, vendedor, itens). Uma por pedido.                  |
| 2   | Solicitar prazo                                | 0033     | No pedido, "Solicitar prazo": o PCP recebe o aviso, informa a data e o comercial é avisado. A liberação usa esse prazo.             |
| 3   | Itens do pedido com identidade fixa            | 0034     | Nada visível. Prepara "uma ordem por item" (ver nota técnica 1).                                                                    |
| 4   | Ordens automáticas e ordem sem pedido          | 0036     | Ao criar a liberação, nasce uma ordem por item ("Aguardando liberação"). Sem pedido, o PCP abre a ordem à mão com o motivo.         |
| 5   | Mudança depois da liberação                    | 0038     | Mudou o pedido já liberado: comentário automático na liberação e aviso ao PCP. Um item novo ganha uma ordem nova.                   |
| 6   | Etapas da ordem a partir do checklist          | 0039     | As etapas vêm do checklist, com as regras do Projeto: quem marcou e quando, só gestão desmarca, parâmetros fixos.                   |
| 7   | Conclusão com conferência e cliente            | 0040     | Montagem marca feito → "Aguardando conferência" → PCP confere → comercial avisa o cliente e registra a confirmação → Concluída.      |
| 8   | Status Serviços lendo as ordens                | —        | O comercial vê etapa, prazo, data na Programação, equipe e fotos. Projetos antigos aparecem até terminarem.                         |
| 9   | IA que ajuda o PCP a dar o prazo               | —        | Ao responder "Solicitar prazo", o PCP vê a carga do período e uma sugestão da IA com o motivo. Ele aceita ou escolhe outra data.     |
| 10  | Briefing e visita ligados ao pedido ou à ordem | 0041     | Briefing e visita técnica ganham "pedido" ou "ordem" (opcionais). Os feitos antes do pedido aparecem também na ordem.               |
| 11  | Mídia OOH: ordem de colagem                    | 0042     | O item de mídia gera uma ordem do tipo "Colagem" com ponto e bi-semana, que entra na Programação.                                   |

A IA (etapa 9) vem depois das ordens automáticas, porque precisa de ordens e Programação reais
para medir a carga. Até lá, o "Solicitar prazo" funciona sem ela.

**Etapa extra, fora da ordem (0035, 26/11/2026): tempo das etapas, adaptativo.** Na ordem, quem
executa toca Iniciar (escolhendo quem trabalha), Pausar (com motivo) e dá baixa na etapa. O
sistema soma as horas × pessoas e aprende o tempo de cada etapa pelas etapas já concluídas,
separando por serviço e pela complexidade que o PCP marca na ordem (Simples / Média /
Complexa). Entrou antes da etapa 4 para o histórico começar a acumular logo; ele alimenta a
skill de PCP e a IA da etapa 9. Detalhes em `AGENTS.md` (Tempo das etapas). **Por isso, as
migrações das etapas 4 a 11 andam uma casa: a etapa 4 passa a ser a 0036.** A etapa 6 (etapas a
partir do checklist) precisa manter `iniciar_etapa_producao`/`pausar_etapa_producao` e fechar o
trecho aberto ao dar baixa, como faz o `atualizar_etapa_producao` da 0035.

A 0037 ficou para o Dashboard (`docs/dashboard-indicadores.md`), então as etapas 5 a 11 começam na
0038.

Os números de migração são uma previsão: confira o próximo número livre em todas as branches
antes de cada etapa.

## Decisões dos pontos em aberto (26/11/2026)

1. **Quando o pedido está "fechado":** com o aceite do cliente. O comercial solicita o prazo, o
   PCP dá o prazo e o comercial faz a liberação.
2. **Quais itens geram ordem:** todos, inclusive o Item livre. Se for preciso, isso muda depois.
3. **Checklist das etapas:** os checklists que já existem hoje (os mesmos do Projeto).
4. **Quem registra a confirmação do cliente:** o comercial.
5. **Pedido alterado depois da liberação:** é um gargalo na empresa, então o pedido não trava. A
   mudança vira um registro (comentário automático) na liberação.

## Notas técnicas (para o Claude)

1. `salvar_venda` (0020) apaga e recria os itens a cada gravação, então o id do item muda. Antes
   de ligar a ordem ao item (`ordens_producao.venda_item_id`), a etapa 3 troca isso por
   atualizar/inserir/apagar por id.
2. Etapa 1: `liberacoes.venda_id` (único quando preenchido) e `liberacoes.cadastro_id`, opcionais;
   `guard_liberacoes` continua mandando no fluxo. Liberação sem pedido exige
   `motivo_sem_pedido in ('Garantia','Retrabalho','Interno','Urgência')`.
3. Etapa 2: guarde no pedido quem pediu o prazo e quando, a data dada pelo PCP, quem deu e quando,
   e uma observação. Só o PCP/gestão responde (`can_gerir_operacao`), por função security definer.
   Os avisos vão por `avisar()`. Na liberação, `data_entrega` vem preenchida com esse prazo.
4. Etapa 4: novo status de ordem `Aguardando liberação`. As ordens são criadas por uma função
   security definer chamada pelo gatilho da liberação (o comercial não tem `can_gerir_operacao`).
   `ordens_producao.liberacao_id` liga a ordem à liberação. A aprovação deixa de criar Projeto
   para liberações ligadas a pedido; as antigas não mudam.
5. Etapa 5: um gatilho em `vendas`/`vendas_itens` grava um evento em `liberacao_eventos` (tipo
   novo, por exemplo `alteracao_pedido`, com o antes e o depois) e avisa o PCP. Um item novo cria
   uma ordem nova. Um item removido cancela a ordem se ela não começou; se começou, a ordem
   continua e o comentário avisa o PCP.
6. Etapa 6: copie a lógica de `create_project` / `guard_project_tasks` para
   `ordens_producao_etapas` (`concluido_por`, trava de parâmetros fixos, só gestão desmarca) e
   cubra com um `tests/db/*.check.sql`, como em `task-rules.check.sql`. O checklist vem do
   produto/serviço do item quando houver um padrão; o PCP pode trocar ao aprovar.
7. Etapa 7: novos status `Aguardando conferência` e `Aguardando cliente`. Quando a Programação
   marca `Concluído` em todos os serviços da ordem, ela passa a `Aguardando conferência`. A
   confirmação do cliente é registrada pelo comercial (`can_vender`) com data e nome. Quando todas
   as ordens do pedido estão Concluídas, o pedido vira `Concluído`.
8. Etapa 9: siga o padrão da IA dos bloqueios (`src/routes/api/next-steps.ts`): rota no
   servidor, token verificado, limite diário (`registrar_uso_ia`), chave só na Cloudflare. A carga
   é calculada no banco (ordens abertas por semana e setor, Cronograma, Programação) e enviada
   resumida para a IA. Sem `AI_API_KEY`, a tela mostra só a carga. A IA só sugere e não grava nada.
9. Etapa 11: `ordens_producao.tipo` ganha `Colagem`; a ordem guarda `ponto_id` e a bi-semana do item.
10. Cada etapa: SQL testado no PGlite, rodado no SQL Editor do Supabase antes da `main`,
    `types.ts` regenerado e `AGENTS.md` atualizado.
