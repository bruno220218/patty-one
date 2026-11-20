import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { dbError } from "./db-errors";
import { parseValor } from "./comercial-rules";
import type {
  AluguelForm,
  ContaForm,
  EnergiaForm,
  Periodicidade,
  StatusConta,
} from "./financeiro-rules";

// The financeiro tables are newer than the generated database types.
const db = supabase as unknown as SupabaseClient;

type Row = Record<string, unknown>;
const txt = (v: unknown) => (typeof v === "string" ? v : "");
const txtOuNull = (v: unknown) => (typeof v === "string" && v ? v : null);
const um = (v: unknown) => (Array.isArray(v) ? (v[0] as Row | undefined) : (v as Row | null));
const nulo = (s: string) => s.trim() || null;

export interface ContaReceber {
  id: string;
  descricao: string;
  vencimento: string;
  valor: number;
  status: StatusConta;
  recebidoEm: string | null;
  cadastroId: string | null;
  clienteNome: string;
  vendaId: string | null;
  pedidoNumero: number | null;
  empresaId: string | null;
  empresaNome: string;
  observacao: string;
}
export interface ContratoAluguel {
  id: string;
  contrato: string;
  proprietario: string;
  midias: string;
  periodicidade: Periodicidade;
  vigencia: string | null;
  vencimento: string | null;
  valor: number;
  ativo: boolean;
  validado: boolean;
  observacao: string;
}
export interface ContratoEnergia {
  id: string;
  numCliente: string;
  numInstalacao: string;
  unidade: string;
  dataInicio: string | null;
  titular: string;
  local: string;
  ativo: boolean;
  observacao: string;
}

const toConta = (r: Row): ContaReceber => ({
  id: txt(r["id"]),
  descricao: txt(r["descricao"]),
  vencimento: txt(r["vencimento"]),
  valor: Number(r["valor"]) || 0,
  status: (txt(r["status"]) || "Aberto") as StatusConta,
  recebidoEm: txtOuNull(r["recebido_em"]),
  cadastroId: txtOuNull(r["cadastro_id"]),
  clienteNome: txt(um(r["cadastros"])?.["nome"]),
  vendaId: txtOuNull(r["venda_id"]),
  pedidoNumero: um(r["vendas"]) ? Number(um(r["vendas"])?.["numero"]) : null,
  empresaId: txtOuNull(r["empresa_id"]),
  empresaNome: txt(um(r["empresas"])?.["nome"]),
  observacao: txt(r["observacao"]),
});
const toAluguel = (r: Row): ContratoAluguel => ({
  id: txt(r["id"]),
  contrato: txt(r["contrato"]),
  proprietario: txt(r["proprietario"]),
  midias: txt(r["midias"]),
  periodicidade: (txt(r["periodicidade"]) || "Mensal") as Periodicidade,
  vigencia: txtOuNull(r["vigencia"]),
  vencimento: txtOuNull(r["vencimento"]),
  valor: Number(r["valor"]) || 0,
  ativo: Boolean(r["ativo"]),
  validado: Boolean(r["validado"]),
  observacao: txt(r["observacao"]),
});
const toEnergia = (r: Row): ContratoEnergia => ({
  id: txt(r["id"]),
  numCliente: txt(r["num_cliente"]),
  numInstalacao: txt(r["num_instalacao"]),
  unidade: txt(r["unidade"]),
  dataInicio: txtOuNull(r["data_inicio"]),
  titular: txt(r["titular"]),
  local: txt(r["local"]),
  ativo: Boolean(r["ativo"]),
  observacao: txt(r["observacao"]),
});

/** Deletes are allowed to Gestão and Direção only; RLS just hides the row from others. */
async function excluir(tabela: string, id: string) {
  const { data, error } = await db.from(tabela).delete().eq("id", id).select("id");
  if (error) throw dbError(error);
  if (!data?.length) throw new Error("Só a Gestão e a Direção excluem.");
}

export const financeiroRepository = {
  async contas(): Promise<ContaReceber[]> {
    const { data, error } = await db
      .from("contas_receber")
      .select(
        "id, descricao, vencimento, valor, status, recebido_em, cadastro_id, venda_id, empresa_id, observacao, cadastros(nome), vendas(numero), empresas(nome)",
      )
      .order("vencimento")
      .limit(5000);
    if (error) throw dbError(error);
    return (data ?? []).map(toConta);
  },

  async salvarConta(f: ContaForm & { vendaId: string }, id?: string): Promise<void> {
    const linha = {
      descricao: f.descricao.trim(),
      vencimento: f.vencimento,
      valor: parseValor(f.valor),
      cadastro_id: f.cadastroId || null,
      venda_id: f.vendaId || null,
      empresa_id: f.empresaId || null,
      observacao: nulo(f.observacao),
    };
    const { error } = id
      ? await db.from("contas_receber").update(linha).eq("id", id)
      : await db.from("contas_receber").insert(linha);
    if (error) throw dbError(error);
  },

  /** Recebido takes today's date unless one is given; Aberto/Cancelado clear it (database rule). */
  async mudarStatus(id: string, status: StatusConta, recebidoEm?: string): Promise<void> {
    const { error } = await db
      .from("contas_receber")
      .update({ status, recebido_em: status === "Recebido" ? (recebidoEm ?? null) : null })
      .eq("id", id);
    if (error) throw dbError(error);
  },

  excluirConta: (id: string) => excluir("contas_receber", id),

  async alugueis(): Promise<ContratoAluguel[]> {
    const { data, error } = await db
      .from("contratos_aluguel")
      .select("*")
      .order("proprietario")
      .limit(5000);
    if (error) throw dbError(error);
    return (data ?? []).map(toAluguel);
  },

  async salvarAluguel(f: AluguelForm, id?: string): Promise<void> {
    const linha = {
      contrato: nulo(f.contrato),
      proprietario: f.proprietario.trim(),
      midias: nulo(f.midias),
      periodicidade: f.periodicidade,
      vigencia: f.vigencia || null,
      vencimento: f.vencimento || null,
      valor: parseValor(f.valor),
      ativo: f.ativo,
      validado: f.validado,
      observacao: nulo(f.observacao),
    };
    const { error } = id
      ? await db.from("contratos_aluguel").update(linha).eq("id", id)
      : await db.from("contratos_aluguel").insert(linha);
    if (error) throw dbError(error);
  },

  excluirAluguel: (id: string) => excluir("contratos_aluguel", id),

  async energia(): Promise<ContratoEnergia[]> {
    const { data, error } = await db
      .from("contratos_energia")
      .select("*")
      .order("titular")
      .order("local")
      .limit(5000);
    if (error) throw dbError(error);
    return (data ?? []).map(toEnergia);
  },

  async salvarEnergia(f: EnergiaForm, id?: string): Promise<void> {
    const linha = {
      num_cliente: nulo(f.numCliente),
      num_instalacao: nulo(f.numInstalacao),
      unidade: nulo(f.unidade),
      data_inicio: f.dataInicio || null,
      titular: nulo(f.titular),
      local: nulo(f.local),
      ativo: f.ativo,
      observacao: nulo(f.observacao),
    };
    const { error } = id
      ? await db.from("contratos_energia").update(linha).eq("id", id)
      : await db.from("contratos_energia").insert(linha);
    if (error) throw dbError(error);
  },

  excluirEnergia: (id: string) => excluir("contratos_energia", id),
};
