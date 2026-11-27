# Estoque e Compras: plano

**Situação:** plano de 27/11/2026, a partir do pedido do usuário (substitui a proposta genérica
de `docs/compras-perguntas.md`). Decidido no mesmo dia:

- **Banco separado = schema `estoque`** no mesmo Supabase: tabelas e permissões próprias, mesmo
  login. O Patty One lê dele direto.
- **A lista de material de cada serviço** nasce no **orçamento** (proposta/pedido, item por
  item) e quem monta é a **equipe de Projetos**. Quando o pedido é liberado, a lista segue para
  as ordens de produção de cada item.
- **A baixa de material** (saída real) é feita por **uma pessoa do estoque**: nova função
  **Estoque** (almoxarife). Gestor e direção também podem.

---

## Como o estoque funciona

```
Entrada (NF-e/XML ou manual) ──► Estoque ◄── Devolução
                                   │
          Baixa de material ◄──────┤──────► Perda (retrabalho, defeito…)

Lista de material do orçamento ──► Previsão (não mexe no estoque) ──► Lista de compras
```

- **Saldo** de cada produto = entradas + devoluções − baixas − perdas. Nada é apagado: cada
  movimento fica registrado com data, quantidade e responsável.
- **Previsão** (a "triangulação"): estoque atual − material listado nos pedidos/ordens ainda abertos
  (descontando o que já foi baixado para eles). Mostra, por insumo, quanto sobra depois de todos
  os serviços prontos e o que falta. **Não dá baixa.**
- **Lista de compras**: tudo que fica negativo na previsão, para baixar em Excel/CSV.

## Códigos dos produtos

Prefixo do setor + número que o sistema completa sozinho, em sequência dentro do setor:

| Prefixo | Setor         | Exemplo   |
| ------- | ------------- | --------- |
| 01      | Impressão     | `01.0001` |
| 02      | Serralheria   | `02.0001` |
| 03      | Projetos      | `03.0001` |
| 04      | Corte         | `04.0001` |
| 05      | Matéria-prima | `05.0001` |
| 06      | Insumos       | `06.0001` |
| 07      | Ferramentas   | `07.0001` |
| 08      | EPI           | `08.0001` |

## Telas

**Estoque** (logo Patty + "Estoque", simples):

| Produto | Código | Quantidade | Custo | Fornecedor |
| ------- | ------ | ---------- | ----- | ---------- |

Clicando no produto abre a **lista filha** (cada compra/lote):

| Material | Fornecedor | Último valor pago | Data | Lote |
| -------- | ---------- | ----------------- | ---- | ---- |

e os **nomes similares** ligados a ele (ver abaixo). Botões: Importar XML, Exportar, Baixa,
Devolução, Perda.

**Baixa de material** (e Devolução, com os mesmos campos):

| Material | Código | Data | Quantidade | Cliente | Fornecedor | Responsável |
| -------- | ------ | ---- | ---------- | ------- | ---------- | ----------- |

A baixa pode apontar a ordem de produção; aí o cliente vem dela.

**Perda de material** (motivo: retrabalho, produto defeituoso, outro):

| Produto | Data | Quantidade | Fornecedor | Lote | Responsável |
| ------- | ---- | ---------- | ---------- | ---- | ----------- |

**Lista de compras** (da previsão, para baixar):

| Material | Fornecedor | Último valor pago | Lote |
| -------- | ---------- | ----------------- | ---- |

mais a quantidade que falta.

## Importar XML da nota (NF-e) e similares

1. Sobe o XML. O app lê o fornecedor (CNPJ do emitente → cadastro Fornecedor), número da nota e
   cada item (código do fornecedor, descrição, unidade, quantidade, valor, lote quando vier).
2. Para cada item, procura o produto nesta ordem: mesmo fornecedor + mesmo código já ligado →
   mesmo nome já ligado como similar → sem par.
3. Item sem par: a pessoa **marca qual produto do banco é o mesmo** (vira similar, "branch") ou
   cria produto novo. Da próxima nota desse fornecedor, o item já vem reconhecido.
4. Confirma: cada item vira uma entrada (lote) no estoque, com o valor pago.

Exemplo: o produto **COLA INSTANTÂNEA** (`06.0003`) tem os similares "COLA SUPER CIANO"
(fornecedor A), "COLA RAPIDA" (fornecedor B) e "COLA MUITO RAPIDA E BOA" (fornecedor C).

**Exportar**: estoque, movimentos e lista de compras em Excel/CSV. **Importar planilha**: carga
inicial do estoque (produto, setor, quantidade, custo, fornecedor).

---

## Etapas (uma migration cada)

| #    | Etapa                                                                                                                                                                                                | Migration |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 1 ✅ | Schema `estoque`, função **Estoque**, produtos com código automático, lotes/entradas, movimentos (entrada manual, baixa, devolução, perda), tela Estoque + lista filha, exportar e importar planilha | 0046      |
| 2 ✅ | Importar XML da NF-e + similares (ligar nomes de fornecedores a um produto)                                                                                                                          | 0047      |
| 3    | Lista de material no orçamento, por item (feita por Projetos, segue para as ordens), previsão sem baixa e lista de compras para baixar; a baixa pode apontar a ordem                                 | 0048      |
| 4    | (depois) Compras: pedido de compra a partir da lista, recebimento → entrada, e conta a pagar "Fornecedor"                                                                                            | —         |

Os números de migration são conferidos de novo antes de cada etapa, porque outra janela também
cria migrations.

**Passo manual no Supabase (uma vez, na etapa 1):** em _Project Settings → Data API → Exposed
schemas_, acrescentar `estoque`. Sem isso, o app não enxerga as tabelas do schema.

## Padrões assumidos (dá para mudar)

- **Unidade** por produto: un, m, m², chapa, rolo, litro, kg, caixa.
- **Lote** é opcional na entrada (nem toda nota traz); se a nota trouxer, vem preenchido.
- **Custo** na tela = último valor pago. Custo e valores só aparecem para Estoque, gestor,
  direção e financeiro; a produção vê produto, código e quantidade.
- **Estoque mínimo** por produto (opcional): abaixo dele, o produto fica marcado na tela.
- O saldo pode ficar negativo só com aviso (para não travar a produção se a nota ainda não
  entrou); a tela mostra em vermelho.
