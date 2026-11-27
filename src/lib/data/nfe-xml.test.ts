import { describe, expect, it } from "vitest";
import { formatarCnpj, lerNfe } from "./nfe-xml";

const CHAVE = "35251112345678000199550010000012341000012345";
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe><infNFe Id="NFe${CHAVE}" versao="4.00">
    <ide><serie>1</serie><nNF>1234</nNF><dhEmi>2026-11-20T09:15:00-03:00</dhEmi></ide>
    <emit><CNPJ>12345678000199</CNPJ><xNome>DISTRIBUIDORA XML LTDA</xNome><xFant>XML</xFant></emit>
    <det nItem="1"><prod><cProd>A1</cProd><xProd>COLA  SUPER CIANO</xProd><NCM>35061090</NCM>
      <uCom>CX</uCom><qCom>2.0000</qCom><vUnCom>9.5000000000</vUnCom><vProd>19.00</vProd>
      <rastro><nLote>L77</nLote><qLote>1</qLote></rastro><rastro><nLote>L78</nLote><qLote>1</qLote></rastro>
    </prod></det>
    <det nItem="2"><prod><cProd>FR</cProd><xProd>FITA VHB</xProd><uCom>RL</uCom>
      <qCom>5</qCom><vUnCom>30</vUnCom><vProd>150.00</vProd></prod></det>
    <total><ICMSTot><vProd>169.00</vProd><vNF>169.00</vNF></ICMSTot></total>
  </infNFe></NFe>
  <protNFe><infProt><chNFe>${CHAVE}</chNFe></infProt></protNFe>
</nfeProc>`;

describe("leitura do XML da NF-e", () => {
  it("lê cabeçalho e itens", () => {
    const n = lerNfe(XML);
    expect(n).toMatchObject({
      chave: CHAVE,
      numero: "1234",
      serie: "1",
      emissao: "2026-11-20",
      cnpj: "12345678000199",
      fornecedorNome: "DISTRIBUIDORA XML LTDA",
      valorTotal: 169,
    });
    expect(n.itens).toEqual([
      {
        numero: 1,
        codigo: "A1",
        nome: "COLA SUPER CIANO",
        unidade: "CX",
        quantidade: 2,
        valorUnitario: 9.5,
        valorTotal: 19,
        lote: "L77, L78",
        ncm: "35061090",
      },
      {
        numero: 2,
        codigo: "FR",
        nome: "FITA VHB",
        unidade: "RL",
        quantidade: 5,
        valorUnitario: 30,
        valorTotal: 150,
        lote: null,
        ncm: null,
      },
    ]);
  });
  it("aceita a NF-e sem o nfeProc e sem chave", () => {
    const sem = XML.replace(/<protNFe>.*<\/protNFe>/s, "").replace(` Id="NFe${CHAVE}"`, "");
    expect(lerNfe(sem).chave).toBeNull();
  });
  it("recusa arquivo que não é NF-e", () => {
    expect(() => lerNfe("<a>")).toThrow(/XML válido/);
    expect(() => lerNfe("<pedido><item/></pedido>")).toThrow(/NF-e/);
  });
  it("formata CNPJ e CPF", () => {
    expect(formatarCnpj("12345678000199")).toBe("12.345.678/0001-99");
    expect(formatarCnpj("12345678901")).toBe("123.456.789-01");
    expect(formatarCnpj(null)).toBe("");
  });
});
