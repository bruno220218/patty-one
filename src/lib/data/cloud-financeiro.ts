import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { dbError } from "./db-errors";
import { parseValor } from "./comercial-rules";
import type {
  AluguelForm,
  CategoriaPagar,
  ContaForm,
  EnergiaForm,
  PagarForm,
  Periodicidade,
  StatusConta,
  StatusPagar,
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

// ---------- Contas a pagar e comissões ----------

export interface ContaPagar {
  id: string;
  categoria: CategoriaPagar;
  descricao: string;
  vencimento: string;
  valor: number;
  status: StatusPagar;
  pagoEm: string | null;
  cadastroId: string | null;
  cadastroNome: string;
  /** Who gets paid: the cadastro's name, or the free-text name (a vendedor). */
  favorecido: string;
  empresaId: string | null;
  empresaNome: string;
  contratoAluguelId: string | null;
  contratoEnergiaId: string | null;
  vendaId: string | null;
  pedidoNumero: number | null;
  comissaoTipo: "Vendedor" | "Agência" | null;
  comissaoBase: number | null;
  comissaoPercentual: number | null;
  observacao: string;
}
export interface PercentualVendedor {
  vendedor: string;
  percentual: number;
}

const toPagar = (r: Row): ContaPagar => {
  const cadastroNome = txt(um(r["cadastros"])?.["nome"]);
  return {
    id: txt(r["id"]),
    categoria: txt(r["categoria"]) as CategoriaPagar,
    descricao: txt(r["descricao"]),
    vencimento: txt(r["vencimento"]),
    valor: Number(r["valor"]) || 0,
    status: (txt(r["status"]) || "Aberto") as StatusPagar,
    pagoEm: txtOuNull(r["pago_em"]),
    cadastroId: txtOuNull(r["cadastro_id"]),
    cadastroNome,
    favorecido: cadastroNome || txt(r["favorecido"]),
    empresaId: txtOuNull(r["empresa_id"]),
    empresaNome: txt(um(r["empresas"])?.["nome"]),
    contratoAluguelId: txtOuNull(r["contrato_aluguel_id"]),
    contratoEnergiaId: txtOuNull(r["contrato_energia_id"]),
    vendaId: txtOuNull(r["venda_id"]),
    pedidoNumero: um(r["vendas"]) ? Number(um(r["vendas"])?.["numero"]) : null,
    comissaoTipo: (txtOuNull(r["comissao_tipo"]) as ContaPagar["comissaoTipo"]) ?? null,
    comissaoBase: r["comissao_base"] == null ? null : Number(r["comissao_base"]),
    comissaoPercentual: r["comissao_percentual"] == null ? null : Number(r["comissao_percentual"]),
    observacao: txt(r["observacao"]),
  };
};

export const financeiroPagarRepository = {
  async contas(): Promise<ContaPagar[]> {
    const { data, error } = await db
      .from("contas_pagar")
      .select(
        "id, categoria, descricao, vencimento, valor, status, pago_em, cadastro_id, favorecido, empresa_id, contrato_aluguel_id, contrato_energia_id, venda_id, comissao_tipo, comissao_base, comissao_percentual, observacao, cadastros(nome), empresas(nome), vendas(numero)",
      )
      .order("vencimento")
      .limit(10000);
    if (error) throw dbError(error);
    return (data ?? []).map(toPagar);
  },

  async salvar(f: PagarForm, id?: string): Promise<void> {
    const linha = {
      categoria: f.categoria,
      descricao: f.descricao.trim(),
      vencimento: f.vencimento,
      valor: parseValor(f.valor),
      cadastro_id: f.cadastroId || null,
      favorecido: nulo(f.favorecido),
      empresa_id: f.empresaId || null,
      contrato_aluguel_id: f.categoria === "Aluguel" ? f.contratoAluguelId || null : null,
      contrato_energia_id: f.categoria === "Energia" ? f.contratoEnergiaId || null : null,
      observacao: nulo(f.observacao),
    };
    // A commission keeps its category and calculation; only the rest is editable.
    const { error } = id
      ? await db.from("contas_pagar").update(linha).eq("id", id)
      : await db.from("contas_pagar").insert(linha);
    if (error) throw dbError(error);
  },

  async mudarStatus(id: string, status: StatusPagar): Promise<void> {
    const { error } = await db.from("contas_pagar").update({ status, pago_em: null }).eq("id", id);
    if (error) throw dbError(error);
  },

  excluir: (id: string) => excluir("contas_pagar", id),

  /** Rent installments of every active contract up to the date; returns how many were created. */
  async gerarParcelasAluguel(ate: string): Promise<number> {
    const { data, error } = await db.rpc("gerar_parcelas_aluguel", { p_ate: ate });
    if (error) throw dbError(error);
    return Number(data) || 0;
  },

  async percentuais(): Promise<PercentualVendedor[]> {
    const { data, error } = await db
      .from("comissao_vendedores")
      .select("vendedor, percentual")
      .order("vendedor");
    if (error) throw dbError(error);
    return (data ?? []).map((r: Row) => ({
      vendedor: txt(r["vendedor"]),
      percentual: Number(r["percentual"]) || 0,
    }));
  },

  async salvarPercentual(vendedor: string, percentual: number): Promise<void> {
    const { error } = await db
      .from("comissao_vendedores")
      .upsert({ vendedor: vendedor.trim(), percentual }, { onConflict: "vendedor" });
    if (error) throw dbError(error);
  },

  async removerPercentual(vendedor: string): Promise<void> {
    const { error } = await db.from("comissao_vendedores").delete().eq("vendedor", vendedor);
    if (error) throw dbError(error);
  },

  /** Seller names already used on pedidos/propostas, to offer in the percentages list. */
  async vendedoresDosPedidos(): Promise<string[]> {
    const { data, error } = await db
      .from("vendas")
      .select("vendedor")
      .not("vendedor", "is", null)
      .limit(5000);
    if (error) throw dbError(error);
    return [
      ...new Set((data ?? []).map((r: Row) => txt(r["vendedor"]).trim()).filter(Boolean)),
    ].sort((a, b) => a.localeCompare(b, "pt-BR"));
  },
};
