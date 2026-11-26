# Patty One — Roadmap

- [x] Shell: sidebar (desktop) / bottom bar (mobile), light/dark theme, pt-BR
- [x] Data access layer (now on Lovable Cloud), unique IDs
- [x] Checklists: create, edit, duplicate, delete (confirm), tasks add/edit/delete/reorder, task count, empty state
- [x] Projetos: "Novo projeto" from checklist or empty; name (required), description, optional due date
- [x] Rule: tasks copied from checklist with new IDs, all unchecked; projects and checklists independent afterwards
- [x] Project card: status, progress bar, done tasks, due date; edit, duplicate, archive, delete (confirm)
- [x] Arquivados: list archived projects, restore, delete
- [x] Project screen: name, description, status, progress % (0% with no tasks), checkbox tasks with completion timestamp, add/edit/delete/reorder tasks, back to projects
- [x] Tests for the business rules
- [x] Checklist option "Parâmetros fixos": projects created from it inherit a lock (tasks only checkable; name/description/due date still editable); badge on checklist card; toggling later doesn't affect existing projects
- [x] App name is "Patty One" (replaces Trilha) everywhere
- [x] Use Patty logo (uploaded PDF) in sidebar/mobile header + favicon
- [x] Bloqueios: describe a blocker on a project, AI suggests next steps from tasks/progress (Lovable AI)
- [x] Accounts with login (email/senha, Google, Lovable); first signup becomes gestor; Equipe page to grant gestão
- [x] Record who completed each task; once checked only a gestor can uncheck (enforced in database)
- [x] Checklists area visible only to gestores
- [x] Apply uploaded migration: liberações, approval flow, team functions
- [ ] Tela de gestão: charts of progress per project, per checklist, and blockers, for the team to see what is in progress (waiting on user go-ahead)

## Migração do PattyOne (sistema antigo) para cá
- [x] Cadastros: lista, filtros, atribuir vendedor, ficha em abas (CEP pelo ViaCEP), importação do SIGE (só gestão); dados bancários só para Direção e Financeiro (função nova "Financeiro") — migração 0018
- [x] Configurações: aparência, perfil e sair
- [x] Operação (setor Produção): ordens de produção com alertas de prazo, cronograma, equipes de planejamento, veículos, produtos/serviços/colaboradores e "Programação Produção" com resumo para WhatsApp (imagens no Drive) — migração 0019
- [x] Comercial: propostas e pedidos (PDF, proposta → pedido), histórico do SIGE (importação só gestão) e ordem de produção ligada ao pedido — migração 0020
- [x] Mídia OOH: pontos com fotos no Drive, mapa (chave própria do Google Maps), calendário oficial das bi-semanas e ocupação → itens "Mapeamento das áreas" e "Datas de colagens" — migração 0022
- [x] Trazer os dados reais do PattyOne (cadastros, pontos, calendário, colaboradores, veículos, serviços)

## Fluxo Comercial → Produção → Execução (prioridade 100%)
Plano em `docs/fluxo-producao-plano.md` (respostas do Vitor em `docs/fluxo-producao-perguntas.md`).
- [x] 1. Liberação ligada ao pedido e ao cadastro (uma por pedido) — 0032 (no ar em 26/11)
- [x] 2. Solicitar prazo: comercial pede, PCP dá a data — 0033 (no ar em 26/11)
- [x] 3. Itens do pedido com identidade fixa — 0034 (no ar em 26/11)
- [x] Extra. Tempo das etapas adaptativo (Iniciar/Pausar/baixa, complexidade, estimativas) + botão "Dados para a skill PCP" — 0035 (no ar em 26/11)
- [x] 4. Ordens automáticas (uma por item, todos os itens) e ordem sem pedido com motivo — 0036 (no ar em 26/11)
- [x] 5. Mudança no pedido depois da liberação vira comentário automático + aviso ao PCP — 0038 (no ar em 26/11)
- [x] 6. Etapas da ordem a partir do checklist (Projeto deixa de ser controle separado) — 0039 (no ar em 26/11)
- [x] 7. Conclusão: montagem → PCP confere → comercial registra a confirmação do cliente — 0040 (no ar em 26/11)
- [x] 8. Status Serviços lendo as ordens (no ar em 26/11)
- [x] 9. IA que ajuda o PCP a dar o prazo (sugere pela carga; o PCP decide) — 0043, 1ª leva do assistente do PCP: prazo e liberação (no ar em 26/11); 2ª leva: ordem/conferência e Programação do dia — 0044 (no ar em 26/11)
- [x] 10. Briefing e visita ligados ao pedido ou à ordem — 0041 (no ar em 26/11)
- [x] 11. Mídia OOH: ordem de colagem — 0042 (no ar em 26/11)

## Tarefas futuras (agendadas)
- [x] Financeiro: a receber, contratos de aluguel e de energia (vindos do PattyOne; só Gestão, Direção e Financeiro) — migração 0026
- [x] Financeiro: contas a pagar (fornecedores, aluguel com parcelas geradas, energia, impostos e outros) e comissões geradas quando o cliente paga (vendedor + agência) — migração 0029
- [x] Dashboard com números reais (decisões do Vitor em `docs/dashboard-indicadores.md`): 20 cartões, cada função vê as suas seções, Gestão e Direção abrem nele — migração 0037
- [ ] Dashboard, 2ª versão: filtro por empresa do grupo e gráficos (pedidos por mês em 12 meses, ocupação das próximas 6 bi-semanas)
- [ ] Telas que eram só "Em breve" no PattyOne: Compras e Estoque, Administrativo, Painel de Gestão (Balcão foi descartado em 25/11)

