# Setor Compras: proposta e perguntas

**Para:** Vitor · **Situação:** substituído em 27/11/2026 pelo plano em `docs/estoque-plano.md`

No PattyOne, "Compras e Estoque" era só uma tela "Em breve": não existe regra antiga para copiar.
Este arquivo traz uma proposta de como o setor funcionaria no app e as perguntas que decidem os
detalhes. Cada pergunta já tem uma **sugestão**: se ela servir, basta escrever "ok".

---

## Como usar (com o Claude)

1. Abra o Claude no repositório `patty-one` e peça:
   > Leia `docs/compras-perguntas.md` e me ajude a responder as perguntas.
2. Responda do jeito que explicaria para alguém da equipe. "Não sei" ou "tanto faz" também servem.
3. Quando terminar, peça:
   > Monte o plano de Compras conforme as respostas de `docs/compras-perguntas.md`.

---

## O que já existe no app e se liga a Compras

| Onde                        | O que já tem                                                     |
| --------------------------- | ---------------------------------------------------------------- |
| Cadastros                   | Marca "Fornecedor" no cadastro (CNPJ, contato, dados bancários). |
| Financeiro → Contas a pagar | Categoria "Fornecedor", vencimento, valor, pago/aberto.          |
| Ordens de produção          | Etapas que podem ser **pausadas por falta de material**.         |
| Setores da produção         | Externa, Serralheria, Corte, Pintura, Acabamento, Produção etc.  |

Hoje nada liga a falta de material na ordem a uma compra, nem a compra à conta a pagar.

---

## Proposta: o caminho de uma compra

```
Solicitação  →  Cotação  →  Pedido de compra  →  Recebimento  →  Conta a pagar
 (quem precisa)  (compras)    (aprovado)          (conferido)      (financeiro)
```

1. **Solicitação de compra**: quem precisa (produção, PCP, criação, escritório) pede o material:
   o quê, quantidade, para quando e, se for para um serviço, **qual ordem de produção**.
2. **Cotação**: compras pede preço a 1 ou mais fornecedores e registra os valores.
3. **Pedido de compra**: escolhe o fornecedor, gera o pedido (com número) e, se precisar, passa
   por aprovação.
4. **Recebimento**: quando o material chega, alguém confere (quantidade certa? avaria?).
5. **Conta a pagar**: o pedido recebido vira automaticamente conta a pagar "Fornecedor",
   com vencimento e parcelas, ligada ao fornecedor e ao pedido.

Junto disso, um **cadastro de materiais** (chapa ACM, lona, vinil, tinta, parafuso…) com unidade
(m², m, chapa, litro, unidade), para a mesma coisa não ser escrita de dez jeitos diferentes.

Estoque fica para **uma segunda fase** (ver pergunta 9).

---

## Perguntas

### Quem faz o quê

**1. Quem trabalha em compras hoje? É uma pessoa só, ou o financeiro/gestão acumula?**
Sugestão: criar a função **Compras** no app (como já existem Comercial, PCP, Financeiro).

> Resposta:

**2. Quem pode pedir material (abrir solicitação)?**
Sugestão: qualquer pessoa com login; a produção pede pelo celular.

> Resposta:

**3. Precisa de aprovação antes de comprar? Acima de que valor, e quem aprova?**
Sugestão: até R$ 1.000 compras decide sozinho; acima disso a direção aprova no app.

> Resposta:

### Como se compra

**4. Vocês fazem cotação com mais de um fornecedor? Sempre ou só acima de um valor?**
Sugestão: cotação é opcional; o app guarda os preços para comparar da próxima vez.

> Resposta:

**5. Hoje como o pedido chega ao fornecedor (WhatsApp, e-mail, telefone)? Querem um PDF do
pedido de compra para enviar?**
Sugestão: gerar PDF/texto pronto para colar no WhatsApp.

> Resposta:

**6. Cada compra é ligada a um serviço (ordem de produção), ou boa parte é material de uso
geral (comprado para estoque)?**
Sugestão: a ligação com a ordem é opcional, mas quando existe o custo entra no serviço.

> Resposta:

**7. Quando a produção pausa uma etapa por "falta de material", isso deve abrir a solicitação
de compra sozinho?**
Sugestão: sim, abre um rascunho de solicitação ligado à ordem; compras completa.

> Resposta:

### Recebimento e pagamento

**8. Quem confere o material quando chega? Precisa registrar a nota fiscal (número/arquivo)?**
Sugestão: quem recebe marca "recebido" e anexa foto/PDF da nota; o número da NF é obrigatório.

> Resposta:

**9. Como costumam pagar fornecedor (à vista, boleto 28 dias, parcelado)? A conta a pagar
deve nascer na hora do pedido ou só quando o material chega?**
Sugestão: nasce no recebimento, com as parcelas combinadas no pedido.

> Resposta:

### Estoque

**10. Vocês controlam estoque hoje? De quais materiais (chapas, lonas, tintas…)?**
Sugestão: fase 2. Primeiro só compras; depois estoque com entrada pelo recebimento e saída
pela ordem de produção, e aviso de estoque mínimo.

> Resposta:

**11. Existe almoxarifado (alguém que entrega o material para a produção), ou cada setor pega?**

> Resposta:

### Telas e prioridade

**12. Das telas abaixo, quais são mais urgentes?** (numere por ordem)

- [ ] Solicitações de compra (fila do comprador)
- [ ] Pedidos de compra (com fornecedor, valores, prazo de entrega)
- [ ] Recebimento
- [ ] Cadastro de materiais
- [ ] Histórico de preços por material/fornecedor
- [ ] Estoque

> Resposta:

**13. Mais alguma coisa que dá problema em compras hoje?** (atraso de fornecedor, compra
duplicada, material errado, falta de controle de gastos…)

> Resposta:
