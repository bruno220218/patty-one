/**
 * Cadastros: field lists, masks and the SIGE spreadsheet conversions. Pure functions, safe in
 * the browser and tested in cadastros-rules.test.ts.
 */
import type { CurrentUser } from "./types";

export const TEXT_FIELDS = [
  "id_sige",
  "tipo_pessoa",
  "nome",
  "razao_social",
  "cpf_cnpj",
  "ie",
  "im",
  "vendedor",
  "origem",
  "contato",
  "celular",
  "celular2",
  "telefone",
  "telefone2",
  "email",
  "email2",
  "contato_financeiro",
  "telefone_financeiro",
  "email_financeiro",
  "cep",
  "endereco",
  "numero",
  "complemento",
  "bairro",
  "cidade",
  "estado",
  "codigo_municipio",
  "tipo_comissao",
  "observacao",
  "validado",
] as const;
export const BOOLEAN_FIELDS = ["is_cliente", "is_fornecedor", "is_prestador", "reter_iss"] as const;
export const NUMERIC_FIELDS = [
  "percentual_iss",
  "percentual_comissao",
  "percentual_servicos",
] as const;
export const BANKING_FIELDS = ["titular", "banco", "cod_banco", "agencia", "conta"] as const;
/** Columns the import understands (CSV header, case-insensitive). */
export const IMPORT_FIELDS: readonly string[] = [
  ...TEXT_FIELDS,
  ...BOOLEAN_FIELDS,
  ...NUMERIC_FIELDS,
  ...BANKING_FIELDS,
];

const isIn = (list: readonly string[], key: string) => list.includes(key);
export const isBooleanField = (key: string) => isIn(BOOLEAN_FIELDS, key);
export const isNumericField = (key: string) => isIn(NUMERIC_FIELDS, key);
export const isBankingField = (key: string) => isIn(BANKING_FIELDS, key);

export type CadastroValues = Record<string, string | boolean | number | null>;

export const CADASTRO_LABELS: Record<string, string> = {
  id_sige: "ID SIGE",
  tipo_pessoa: "Tipo de pessoa",
  nome: "Nome fantasia / Nome",
  razao_social: "Razão social",
  cpf_cnpj: "CPF/CNPJ",
  ie: "Inscrição estadual",
  im: "Inscrição municipal",
  is_cliente: "Cliente",
  is_fornecedor: "Fornecedor",
  is_prestador: "Prestador",
  vendedor: "Vendedor",
  origem: "Origem",
  contato: "Contato",
  celular: "Celular",
  celular2: "Celular 2",
  telefone: "Telefone",
  telefone2: "Telefone 2",
  email: "E-mail",
  email2: "E-mail 2",
  contato_financeiro: "Contato financeiro",
  telefone_financeiro: "Telefone financeiro",
  email_financeiro: "E-mail financeiro",
  cep: "CEP",
  endereco: "Endereço",
  numero: "Número",
  complemento: "Complemento",
  bairro: "Bairro",
  cidade: "Cidade",
  estado: "Estado",
  codigo_municipio: "Código do município",
  reter_iss: "Reter ISS",
  percentual_iss: "ISS (%)",
  tipo_comissao: "Tipo de comissão",
  percentual_comissao: "Comissão (%)",
  percentual_servicos: "Serviços (%)",
  observacao: "Observação",
  validado: "Validado",
  titular: "Titular",
  banco: "Banco",
  cod_banco: "Código do banco",
  agencia: "Agência",
  conta: "Conta",
};

export const CADASTRO_OPCOES: Record<string, readonly string[]> = {
  tipo_pessoa: ["Pessoa Jurídica", "Pessoa Física"],
  validado: ["Sim", "Não"],
  tipo_comissao: [
    "Nenhuma",
    "Comissão como Agência",
    "Comissão como Representante",
    "Comissão de aluguel",
  ],
};

export type CadastroAba = "gerais" | "contatos" | "endereco" | "fiscal" | "bancario";

export const CADASTRO_ABAS: { value: CadastroAba; label: string; campos: readonly string[] }[] = [
  {
    value: "gerais",
    label: "Dados gerais",
    campos: [
      "id_sige",
      "tipo_pessoa",
      "nome",
      "razao_social",
      "cpf_cnpj",
      "is_cliente",
      "is_fornecedor",
      "is_prestador",
      "vendedor",
      "origem",
      "validado",
      "observacao",
    ],
  },
  {
    value: "contatos",
    label: "Contatos",
    campos: [
      "contato",
      "celular",
      "celular2",
      "telefone",
      "telefone2",
      "email",
      "email2",
      "contato_financeiro",
      "telefone_financeiro",
      "email_financeiro",
    ],
  },
  {
    value: "endereco",
    label: "Endereço",
    campos: [
      "cep",
      "endereco",
      "numero",
      "complemento",
      "bairro",
      "cidade",
      "estado",
      "codigo_municipio",
    ],
  },
  {
    value: "fiscal",
    label: "Fiscal/Comissão",
    campos: [
      "ie",
      "im",
      "reter_iss",
      "percentual_iss",
      "tipo_comissao",
      "percentual_comissao",
      "percentual_servicos",
    ],
  },
  { value: "bancario", label: "Bancário", campos: BANKING_FIELDS },
];

/** Comercial and gestão create and edit cadastros (database rule: can_editar_cadastros). */
export function canEditarCadastros(user: CurrentUser | null | undefined): boolean {
  return Boolean(user && user.funcoes.some((f) => f === "gestor" || f === "comercial"));
}

/** Bank details: direção and financeiro only (database rule: can_ver_bancario). */
export function canVerBancario(user: CurrentUser | null | undefined): boolean {
  return Boolean(user && user.funcoes.some((f) => f === "direcao" || f === "financeiro"));
}

export const normalizeHeader = (s: string) => s.replace(/^﻿/, "").trim().toLowerCase();

export function parseBoolean(value: string): boolean | null {
  const s = value.trim().toLowerCase();
  if (!s) return null;
  if (["s", "sim", "true"].includes(s)) return true;
  if (["n", "não", "nao", "false"].includes(s)) return false;
  throw new Error(`Valor sim/não inválido: ${value}`);
}

/** Accepts "1.234,50", "5,00" and "5.5". */
export function parseNumeric(value: string): number | null {
  let s = value.trim();
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  if (!/^[+-]?\d+(\.\d+)?$/.test(s)) throw new Error(`Número inválido: ${value}`);
  const n = Number(s);
  if (!Number.isFinite(n)) throw new Error(`Número inválido: ${value}`);
  return n;
}

/** One spreadsheet row → fields the database accepts (unknown columns are dropped). */
export function normalizeRow(raw: Record<string, string>): CadastroValues {
  const out: CadastroValues = {};
  for (const [header, value] of Object.entries(raw)) {
    const key = normalizeHeader(header);
    if (!IMPORT_FIELDS.includes(key)) continue;
    const s = String(value ?? "").trim();
    if (isBooleanField(key)) out[key] = parseBoolean(s);
    else if (isNumericField(key)) out[key] = parseNumeric(s);
    else if (key === "validado") out[key] = s ? (parseBoolean(s) ? "Sim" : "Não") : null;
    else if (key === "estado") out[key] = s.toUpperCase() || null;
    else out[key] = s || null;
  }
  return out;
}

export function maskDocument(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 14);
  return d.length <= 11
    ? d
        .replace(/^(\d{3})(\d)/, "$1.$2")
        .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
        .replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4")
    : d
        .replace(/^(\d{2})(\d)/, "$1.$2")
        .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
        .replace(/\.(\d{3})(\d)/, ".$1/$2")
        .replace(/(\d{4})(\d)/, "$1-$2");
}

export const maskCep = (v: string) =>
  v
    .replace(/\D/g, "")
    .slice(0, 8)
    .replace(/^(\d{5})(\d)/, "$1-$2");

export function maskPhone(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 11);
  return d
    .replace(/^(\d{2})(\d)/, "($1) $2")
    .replace(d.length > 10 ? /(\d{5})(\d{1,4})$/ : /(\d{4})(\d{1,4})$/, "$1-$2");
}

/** Mask applied while typing in the form. */
export function maskField(key: string, raw: string): string {
  if (key === "cpf_cnpj") return maskDocument(raw);
  if (key === "cep") return maskCep(raw);
  if (key.includes("telefone") || key.startsWith("celular")) return maskPhone(raw);
  if (key === "estado") return raw.toUpperCase();
  return raw;
}

/** Form values → payload for salvar_cadastro (bank fields only when the person may send them). */
export function cadastroPayload(values: CadastroValues, incluirBancario: boolean): CadastroValues {
  const payload: CadastroValues = {};
  for (const aba of CADASTRO_ABAS) {
    for (const key of aba.campos) {
      if (isBankingField(key) && !incluirBancario) continue;
      const value = values[key];
      payload[key] = isBooleanField(key)
        ? Boolean(value)
        : isNumericField(key)
          ? parseNumeric(String(value ?? ""))
          : String(value ?? "").trim() || null;
    }
  }
  return payload;
}
