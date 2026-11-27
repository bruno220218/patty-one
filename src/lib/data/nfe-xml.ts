/**
 * Reads an NF-e XML (the file the supplier sends, with or without the nfeProc wrapper) in the
 * browser: header (chave, número, série, emissão, emitente) and the items with code, description,
 * unit, quantity, unit price and lote (`rastro`). Pure function over the text; tested in
 * nfe-xml.test.ts. Nothing here talks to the database.
 */

export interface ItemNfe {
  /** nItem of the note (1, 2…). */
  numero: number;
  /** Supplier's product code (cProd). */
  codigo: string;
  /** Supplier's description (xProd). */
  nome: string;
  unidade: string;
  quantidade: number;
  valorUnitario: number;
  valorTotal: number;
  /** Lotes in `rastro/nLote`, joined with ", " (null when the note has none). */
  lote: string | null;
  ncm: string | null;
}

export interface NotaNfe {
  /** 44-digit access key (null when the file has none). */
  chave: string | null;
  numero: string;
  serie: string;
  /** "YYYY-MM-DD". */
  emissao: string | null;
  /** Supplier CNPJ (or CPF) digits. */
  cnpj: string | null;
  fornecedorNome: string;
  valorTotal: number | null;
  itens: ItemNfe[];
}

const filhos = (el: Element | Document, nome: string): Element[] =>
  Array.from(el.getElementsByTagName("*")).filter((e) => e.localName === nome);
const primeiro = (el: Element | Document | null | undefined, nome: string): Element | null =>
  el ? (filhos(el, nome)[0] ?? null) : null;
const texto = (el: Element | Document | null | undefined, nome: string): string =>
  primeiro(el, nome)?.textContent?.trim() ?? "";
const numero = (s: string): number => {
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

/** Throws a message people can act on when the file isn't an NF-e. */
export function lerNfe(xml: string): NotaNfe {
  const doc = new DOMParser().parseFromString(xml.replace(/^\uFEFF/, ""), "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) {
    throw new Error("O arquivo não é um XML válido.");
  }
  const inf = primeiro(doc, "infNFe");
  if (!inf) throw new Error("Este XML não é de uma NF-e (falta o bloco infNFe).");
  const ide = primeiro(inf, "ide");
  const emit = primeiro(inf, "emit");

  const idAttr = (inf.getAttribute("Id") ?? "").replace(/\D/g, "");
  const chaveProt = texto(doc, "chNFe").replace(/\D/g, "");
  const chave = [idAttr, chaveProt].find((c) => c.length === 44) ?? null;

  const dh = texto(ide, "dhEmi") || texto(ide, "dEmi");
  const emissao = /^\d{4}-\d{2}-\d{2}/.test(dh) ? dh.slice(0, 10) : null;

  const cnpj = (texto(emit, "CNPJ") || texto(emit, "CPF")).replace(/\D/g, "") || null;
  const vNF = texto(primeiro(inf, "ICMSTot"), "vNF");

  const itens = filhos(inf, "det").map((det, i) => {
    const prod = primeiro(det, "prod");
    const lotes = filhos(prod ?? det, "nLote")
      .map((l) => l.textContent?.trim() ?? "")
      .filter(Boolean);
    return {
      numero: Number(det.getAttribute("nItem")) || i + 1,
      codigo: texto(prod, "cProd"),
      nome: texto(prod, "xProd").replace(/\s+/g, " "),
      unidade: texto(prod, "uCom"),
      quantidade: numero(texto(prod, "qCom")),
      valorUnitario: numero(texto(prod, "vUnCom")),
      valorTotal: numero(texto(prod, "vProd")),
      lote: lotes.length ? [...new Set(lotes)].join(", ") : null,
      ncm: texto(prod, "NCM") || null,
    };
  });
  if (itens.length === 0) throw new Error("A nota não tem itens.");

  return {
    chave,
    numero: texto(ide, "nNF"),
    serie: texto(ide, "serie"),
    emissao,
    cnpj,
    fornecedorNome: texto(emit, "xNome") || texto(emit, "xFant"),
    valorTotal: vNF ? numero(vNF) : null,
    itens,
  };
}

/** Formats a CNPJ (14 digits) or CPF (11) for display. */
export function formatarCnpj(digitos: string | null): string {
  if (!digitos) return "";
  if (digitos.length === 14)
    return digitos.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (digitos.length === 11)
    return digitos.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return digitos;
}
