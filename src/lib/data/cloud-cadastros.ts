import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { dbError } from "./db-errors";
import type { CadastroValues } from "./cadastros-rules";

// The cadastros tables are newer than the generated database types.
const db = supabase as unknown as SupabaseClient;

export type CadastroTipo = "" | "cliente" | "fornecedor" | "prestador";

export interface CadastroFiltros {
  busca: string;
  vendedor: string;
  estado: string;
  tipo: CadastroTipo;
  semVendedor: boolean;
}

export const CADASTRO_FILTROS_VAZIOS: CadastroFiltros = {
  busca: "",
  vendedor: "",
  estado: "",
  tipo: "",
  semVendedor: false,
};

export const CADASTROS_POR_PAGINA = 50;

export interface CadastroLinha {
  id: string;
  nome: string;
  cpfCnpj: string;
  cidade: string;
  estado: string;
  vendedor: string;
  isCliente: boolean;
  isFornecedor: boolean;
  isPrestador: boolean;
  telefone: string;
  restricaoSige: boolean;
  restricaoObservacao: string;
}

export interface CadastroLista {
  total: number;
  linhas: CadastroLinha[];
  /** Every vendedor/UF in use, for the filters. */
  vendedores: string[];
  estados: string[];
}

export interface CadastroFicha {
  id: string;
  nome: string;
  restricaoSige: boolean;
  restricaoObservacao: string;
  /** Raw columns (snake_case) for the form. */
  valores: CadastroValues;
  /** Null when the person may not see bank details or none were saved. */
  bancario: CadastroValues | null;
}

export interface ImportacaoResultado {
  linha: number;
  nome: string | null;
  cpf_cnpj: string | null;
  resultado: "inserido" | "atualizado" | "erro";
  motivo: string | null;
}

/** Filters in the shape the database function expects. */
const filtrosDb = (f: CadastroFiltros) => ({
  busca: f.busca.trim(),
  vendedor: f.vendedor,
  estado: f.estado,
  tipo: f.tipo,
  sem_vendedor: f.semVendedor,
});

type LinhaDb = {
  id: string;
  nome: string;
  cpf_cnpj: string | null;
  cidade: string | null;
  estado: string | null;
  vendedor: string | null;
  is_cliente: boolean | null;
  is_fornecedor: boolean | null;
  is_prestador: boolean | null;
  telefone: string | null;
  restricao_sige: boolean | null;
  restricao_observacao: string | null;
};

const toLinha = (r: LinhaDb): CadastroLinha => ({
  id: r.id,
  nome: r.nome,
  cpfCnpj: r.cpf_cnpj ?? "",
  cidade: r.cidade ?? "",
  estado: r.estado ?? "",
  vendedor: r.vendedor ?? "",
  isCliente: Boolean(r.is_cliente),
  isFornecedor: Boolean(r.is_fornecedor),
  isPrestador: Boolean(r.is_prestador),
  telefone: r.telefone ?? "",
  restricaoSige: Boolean(r.restricao_sige),
  restricaoObservacao: r.restricao_observacao ?? "",
});

const pickValores = (row: Record<string, unknown>): CadastroValues => {
  const out: CadastroValues = {};
  for (const [k, v] of Object.entries(row)) {
    if (v === null || typeof v === "string" || typeof v === "boolean" || typeof v === "number") {
      out[k] = v;
    }
  }
  return out;
};

export const cadastroRepository = {
  /** One page (50 rows), filtered and searched in the database. */
  async list(filtros: CadastroFiltros, pagina: number): Promise<CadastroLista> {
    const { data, error } = await db.rpc("listar_cadastros", {
      filtros: filtrosDb(filtros),
      pagina: Math.max(1, pagina),
    });
    if (error) throw dbError(error);
    const r = data as { total: number; linhas: LinhaDb[]; vendedores: string[]; estados: string[] };
    return {
      total: Number(r.total) || 0,
      linhas: (r.linhas ?? []).map(toLinha),
      vendedores: r.vendedores ?? [],
      estados: r.estados ?? [],
    };
  },

  /** Bank details are read only when `comBancario` (direção/financeiro; the database checks it too). */
  async get(id: string, comBancario: boolean): Promise<CadastroFicha> {
    const { data, error } = await db.from("cadastros").select("*").eq("id", id).maybeSingle();
    if (error) throw dbError(error);
    if (!data) throw new Error("Cadastro não encontrado.");
    let bancario: CadastroValues | null = null;
    if (comBancario) {
      const b = await db.from("cadastros_bancario").select("*").eq("cadastro_id", id).maybeSingle();
      if (b.error) throw dbError(b.error);
      bancario = b.data ? pickValores(b.data as Record<string, unknown>) : null;
    }
    const row = data as Record<string, unknown>;
    return {
      id,
      nome: String(row["nome"] ?? ""),
      restricaoSige: Boolean(row["restricao_sige"]),
      restricaoObservacao: String(row["restricao_observacao"] ?? ""),
      valores: pickValores(row),
      bancario,
    };
  },

  /** Creates (no id) or updates; returns the id. */
  async save(dados: CadastroValues, id?: string): Promise<string> {
    const { data, error } = await db.rpc("salvar_cadastro", {
      dados,
      ...(id ? { cadastro_uuid: id } : {}),
    });
    if (error) {
      if (error.code === "23505") {
        throw new Error(
          "Este CPF/CNPJ ou ID SIGE já está cadastrado. Confira o cadastro existente.",
        );
      }
      throw dbError(error);
    }
    return data as string;
  },

  /** Bank details only (direção/financeiro who don't edit the rest of the cadastro). */
  async saveBancario(id: string, valores: CadastroValues): Promise<void> {
    const texto = (k: string) => String(valores[k] ?? "").trim() || null;
    const { error } = await db.from("cadastros_bancario").upsert({
      cadastro_id: id,
      titular: texto("titular"),
      banco: texto("banco"),
      cod_banco: texto("cod_banco"),
      agencia: texto("agencia"),
      conta: texto("conta"),
    });
    if (error) throw dbError(error);
  },

  /** Gestão only (database rule). Bank details go with it. */
  async remove(id: string): Promise<void> {
    const { data, error } = await db.from("cadastros").delete().eq("id", id).select("id");
    if (error) throw dbError(error);
    if (!data?.length) throw new Error("Só a gestão exclui cadastros.");
  },

  /** Selected ids, or every row matching the filters when `ids` is null. Returns how many changed. */
  async atribuirVendedor(
    vendedor: string,
    alvo: { ids: string[] } | { filtros: CadastroFiltros },
  ): Promise<number> {
    const { data, error } = await db.rpc("atribuir_vendedor", {
      vendedor_novo: vendedor,
      ...("ids" in alvo ? { ids: alvo.ids } : { filtros: filtrosDb(alvo.filtros) }),
    });
    if (error) throw dbError(error);
    return Number(data) || 0;
  },

  /** Up to 500 rows per call (gestão only). */
  async importar(linhas: CadastroValues[]): Promise<ImportacaoResultado[]> {
    const { data, error } = await db.rpc("importar_cadastros", { linhas });
    if (error) throw dbError(error);
    return (data ?? []) as ImportacaoResultado[];
  },
};
