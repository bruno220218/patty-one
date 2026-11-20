import type { Venda } from "@/lib/data/cloud-comercial";
import { brl, totaisVenda, totalItem } from "@/lib/data/comercial-rules";
import { dataBR } from "@/lib/data/producao-rules";

type RGB = [number, number, number];
const PRIMARY: RGB = [37, 101, 80];
const FOOT_BG: RGB = [241, 240, 236];

async function imagemDataUrl(url: string): Promise<string | null> {
  try {
    const blob = await (await fetch(url)).blob();
    return await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Proposta comercial / pedido de venda (A4), same layout as the PattyOne PDF. */
export async function downloadVendaPdf(v: Venda, logoUrl?: string): Promise<void> {
  const [{ jsPDF }, { default: autoTable }, logo] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
    logoUrl ? imagemDataUrl(logoUrl) : Promise.resolve(null),
  ]);
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const lastY = () =>
    (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  const titulo = `${v.tipo === "proposta" ? "Proposta comercial" : "Pedido de venda"} nº ${v.numero}`;

  if (logo) pdf.addImage(logo, "PNG", 14, 10, 22, 22);
  pdf
    .setFont("helvetica", "bold")
    .setFontSize(15)
    .setTextColor(...PRIMARY)
    .text(titulo, 40, 18);
  pdf.setFont("helvetica", "normal").setFontSize(9).setTextColor(60);
  pdf.text(
    [
      v.empresa?.nome ?? "",
      v.empresa?.cnpj ? `CNPJ ${v.empresa.cnpj}` : "",
      `Emissão: ${dataBR(v.createdAt)}${v.validade ? `   ·   Validade: ${dataBR(v.validade)}` : ""}`,
    ].filter(Boolean),
    40,
    24,
  );

  const c = v.cliente;
  const contatos = [c?.contato, c?.telefone, c?.email].filter(Boolean).join("  ·  ");
  autoTable(pdf, {
    startY: 38,
    theme: "plain",
    styles: { fontSize: 9, cellPadding: 1 },
    head: [[{ content: "Cliente", styles: { textColor: PRIMARY, fontStyle: "bold" } }]],
    body: [
      [
        c?.razaoSocial && c.razaoSocial !== c.nome
          ? `${c.nome} — ${c.razaoSocial}`
          : (c?.nome ?? ""),
      ],
      ...(c?.cpfCnpj ? [[`CPF/CNPJ: ${c.cpfCnpj}`]] : []),
      ...(c?.endereco ? [[c.endereco]] : []),
      ...(contatos ? [[contatos]] : []),
    ],
  });

  const t = totaisVenda(v.itens, v.desconto);
  autoTable(pdf, {
    startY: lastY() + 5,
    head: [["Tipo", "Descrição", "Qtd.", "Valor unit.", "Desconto", "Total"]],
    body: v.itens.map((i) => [
      i.categoria,
      [
        i.descricao,
        i.ponto && `Ponto: ${i.ponto}`,
        (i.periodoInicio || i.periodoFim) &&
          `Período: ${dataBR(i.periodoInicio)} a ${dataBR(i.periodoFim)}`,
      ]
        .filter(Boolean)
        .join("\n"),
      i.quantidade.toLocaleString("pt-BR"),
      brl(i.valorUnitario),
      i.desconto ? brl(i.desconto) : "—",
      brl(totalItem(i)),
    ]),
    headStyles: { fillColor: PRIMARY, fontSize: 9 },
    styles: { fontSize: 9, valign: "top" },
    columnStyles: {
      0: { cellWidth: 24 },
      2: { halign: "right", cellWidth: 14 },
      3: { halign: "right", cellWidth: 26 },
      4: { halign: "right", cellWidth: 22 },
      5: { halign: "right", cellWidth: 26 },
    },
    foot: [
      ["", "", "", "", "Subtotal", brl(t.subtotal)],
      ...(t.desconto ? [["", "", "", "", "Desconto", `- ${brl(t.desconto)}`]] : []),
      ["", "", "", "", "Total", brl(t.total)],
    ],
    footStyles: { fillColor: FOOT_BG, textColor: 30, halign: "right", fontStyle: "bold" },
  });

  let y = lastY() + 8;
  pdf.setFontSize(9).setTextColor(40);
  const blocos: [string, string][] = [
    ["Condições de pagamento", v.condicoesPagamento],
    ["Vendedor", v.vendedor],
    ["Observações", v.observacao],
  ];
  for (const [rotulo, valor] of blocos) {
    if (!valor) continue;
    const linhas = pdf.splitTextToSize(valor, 182) as string[];
    if (y + 6 + linhas.length * 4 > 285) {
      pdf.addPage();
      y = 15;
    }
    pdf.setFont("helvetica", "bold").text(rotulo, 14, y);
    pdf.setFont("helvetica", "normal").text(linhas, 14, y + 4.5);
    y += 8 + linhas.length * 4;
  }
  const cliente = (c?.nome ?? "").replace(/[^\p{L}\d]+/gu, "-");
  pdf.save(`${v.tipo === "proposta" ? "Proposta" : "Pedido"}-${v.numero}-${cliente}.pdf`);
}
