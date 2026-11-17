import { describe, expect, it } from "vitest";
import { agruparLixeira } from "./cloud-lixeira";

const base = { detalhe: "", apagado_por_nome: "Bruno" };

describe("agruparLixeira", () => {
  it("agrupa o item apagado com o que foi junto", () => {
    const itens = agruparLixeira([
      {
        ...base,
        lote: 1,
        principal: true,
        tipo: "Projeto",
        rotulo: "CN",
        apagado_em: "2026-11-17T10:00:00Z",
      },
      {
        ...base,
        lote: 1,
        principal: false,
        tipo: "Tarefa",
        rotulo: "",
        apagado_em: "2026-11-17T10:00:00Z",
      },
      {
        ...base,
        lote: 1,
        principal: false,
        tipo: "Tarefa",
        rotulo: "",
        apagado_em: "2026-11-17T10:00:00Z",
      },
      {
        ...base,
        lote: 1,
        principal: false,
        tipo: "Bloqueio",
        rotulo: "",
        apagado_em: "2026-11-17T10:00:00Z",
      },
      {
        ...base,
        lote: 2,
        principal: true,
        tipo: "Tarefa",
        rotulo: "Corte",
        apagado_em: "2026-11-17T11:00:00Z",
      },
    ]);
    expect(itens.map((i) => i.lote)).toEqual([2, 1]);
    expect(itens[1]).toMatchObject({ rotulo: "CN", junto: "2 tarefas, 1 bloqueio" });
    expect(itens[0]!.junto).toBe("");
  });

  it("ignora lotes sem item principal", () => {
    expect(
      agruparLixeira([
        {
          ...base,
          lote: 3,
          principal: false,
          tipo: "Tarefa",
          rotulo: "",
          apagado_em: "2026-11-17T10:00:00Z",
        },
      ]),
    ).toEqual([]);
  });
});
