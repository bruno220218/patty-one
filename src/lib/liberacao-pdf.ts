import type { CellInput, RowInput } from "jspdf-autotable";
import { formatQuantidade, isBlankLiberacaoItem, LIBERACAO_MODELO_INFO } from "@/lib/data/rules";
import type { Liberacao } from "@/lib/data/types";
import { formatDateOnly } from "@/lib/format";

type RGB = [number, number, number];
// App palette (approximations of the CSS tokens in styles.css).
const PRIMARY: RGB = [37, 101, 80];
const PRIMARY_SOFT: RGB = [190, 222, 210];
const ACCENT: RGB = [218, 242, 232];
const SECONDARY: RGB = [241, 240, 236];
const MUTED_TEXT: RGB = [105, 105, 100];
const DONE: RGB = [222, 245, 232];
const DANGER: RGB = [190, 35, 35];
const DANGER_SOFT: RGB = [250, 230, 227];
const BORDER: RGB = [205, 205, 198];

const num = (n: number | null) =>
  n === null ? "" : n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

/** Builds the liberação sheet (A4 landscape, same layout as the spreadsheet) and downloads it. */
export async function downloadLiberacaoPdf(lib: Liberacao, logoUrl?: string): Promise<void> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const info = LIBERACAO_MODELO_INFO[lib.modelo];
  const projeto = lib.modelo === "projeto";
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 10;
  const width = pageW - margin * 2;
  let y = margin;

  const lastY = () =>
    (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  /** Full-width colored band with centered text. */
  const band = (text: string, fill: RGB, color: RGB | number, size = 10, h = 7) => {
    if (y + h > pageH - 12) {
      doc.addPage();
      y = margin;
    }
    doc.setFillColor(...fill);
    doc.rect(margin, y, width, h, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(size);
    if (typeof color === "number") doc.setTextColor(color);
    else doc.setTextColor(...color);
    doc.text(text.toUpperCase(), pageW / 2, y + h / 2 + size * 0.13, { align: "center" });
    y += h;
  };

  // Logo (optional)
  let logo: string | null = null;
  if (logoUrl) {
    try {
      const blob = await (await fetch(logoUrl)).blob();
      logo = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = reject;
        r.readAsDataURL(blob);
      });
    } catch {
      logo = null;
    }
  }

  // Title bar
  doc.setFillColor(...PRIMARY);
  doc.rect(margin, y, width, 11, "F");
  if (logo) doc.addImage(logo, "PNG", margin + 2, y + 0.75, 9.5, 9.5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(255);
  doc.text(`${info.titulo.toUpperCase()} - Nº ${lib.numero}`, pageW / 2, y + 7.2, {
    align: "center",
  });
  y += 13;

  // Header block
  const L = (t: string): CellInput => ({
    content: t.toUpperCase(),
    styles: { fillColor: SECONDARY, textColor: MUTED_TEXT, fontStyle: "bold", fontSize: 7 },
  });
  const V = (t: string, colSpan = 1): CellInput => ({
    content: t,
    colSpan,
    styles: { fontStyle: "bold", fontSize: 9 },
  });
  const date = (d: string | null) => (d ? formatDateOnly(d) : "");
  const headerRows: RowInput[] = [
    [
      L("Cliente"),
      V(lib.cliente, 3),
      L(projeto ? "Projetista" : "Layoutista / projetista"),
      V(lib.projetista),
      L("Data liberação"),
      V(date(lib.dataLiberacao)),
    ],
    [
      L("Responsável"),
      V(lib.responsavel),
      L("Contato"),
      V(lib.contato),
      L("Vendedor"),
      V(lib.vendedor),
      L("Data entrega"),
      V(date(lib.dataEntrega)),
    ],
    [
      L("Endereço (local de referência)"),
      V(lib.endereco, 3),
      L("Classificação da venda"),
      V(lib.classificacaoVenda),
      projeto ? { content: "" } : L("Bissemana"),
      projeto ? { content: "" } : V(lib.bissemana),
    ],
  ];
  autoTable(doc, {
    startY: y,
    body: headerRows,
    theme: "grid",
    margin: { left: margin, right: margin },
    styles: {
      font: "helvetica",
      cellPadding: 1.8,
      lineColor: BORDER,
      lineWidth: 0.2,
      valign: "middle",
      textColor: [20, 20, 20],
    },
    columnStyles: {
      0: { cellWidth: 30 },
      1: { cellWidth: 62 },
      2: { cellWidth: 18 },
      3: { cellWidth: 40 },
      4: { cellWidth: 32 },
      5: { cellWidth: 40 },
      6: { cellWidth: 25 },
    },
  });
  y = lastY() + 3;

  band(info.secao, ACCENT, PRIMARY, 10, 7);

  // Items: two header rows (Tamanho → Largura / Altura)
  const itens = lib.itens.filter((i) => !isBlankLiberacaoItem(i));
  const span2 = (t: string): CellInput => ({ content: t.toUpperCase(), rowSpan: 2 });
  autoTable(doc, {
    startY: y,
    head: [
      [
        {
          content: info.referencia.toUpperCase(),
          rowSpan: 2,
          styles: { fillColor: SECONDARY, textColor: MUTED_TEXT },
        },
        span2("Serviço"),
        span2("Insumos"),
        span2("Acabamento"),
        span2("Instalação"),
        span2("Detalhes"),
        { content: "TAMANHO (CM)", colSpan: 2 },
        span2("Qtda"),
        span2("Local de instalação"),
        span2("Check"),
      ],
      [
        { content: "LARGURA", styles: { textColor: PRIMARY_SOFT, fontSize: 6.5 } },
        { content: "ALTURA", styles: { textColor: PRIMARY_SOFT, fontSize: 6.5 } },
      ],
    ],
    body: itens.length
      ? itens.map((i) => [
          i.referencia,
          i.servico,
          i.insumos,
          i.acabamento,
          i.instalacao,
          i.detalhes,
          num(i.larguraCm),
          num(i.alturaCm),
          formatQuantidade(i.quantidade),
          i.localInstalacao,
          i.checked ? "OK" : "",
        ])
      : [[{ content: "Nenhum item.", colSpan: 11, styles: { textColor: MUTED_TEXT } }]],
    theme: "grid",
    margin: { left: margin, right: margin },
    styles: {
      font: "helvetica",
      fontSize: 8,
      cellPadding: 1.6,
      lineColor: BORDER,
      lineWidth: 0.2,
      valign: "middle",
      textColor: [20, 20, 20],
    },
    headStyles: {
      fillColor: PRIMARY,
      textColor: 255,
      fontStyle: "bold",
      fontSize: 7,
      halign: "center",
      valign: "middle",
      lineColor: [70, 125, 105],
    },
    columnStyles: {
      0: { cellWidth: 20, fillColor: [248, 247, 243] },
      1: { cellWidth: 37 },
      2: { cellWidth: 31 },
      3: { cellWidth: 27 },
      4: { cellWidth: 32 },
      5: { cellWidth: 27 },
      6: { cellWidth: 16, halign: "right" },
      7: { cellWidth: 16, halign: "right" },
      8: { cellWidth: 12, halign: "center" },
      10: { cellWidth: 14, halign: "center", fontStyle: "bold", textColor: PRIMARY },
    },
    didParseCell: (data) => {
      if (data.section !== "body" || !itens.length) return;
      if (itens[data.row.index]?.checked && data.column.index !== 0) {
        data.cell.styles.fillColor = DONE;
      }
    },
  });
  y = lastY();

  if (info.aviso) band(info.aviso, DANGER_SOFT, DANGER, 9, 7);
  y += 3;
  band("Observações", PRIMARY, 255, 9, 6.5);

  const obsRows: RowInput[] = [];
  if (projeto) {
    obsRows.push([L("Ponto de energia"), V(lib.pontoEnergia)]);
    obsRows.push([L("Horário de instalação"), V(lib.horarioInstalacao)]);
  }
  obsRows.push([
    {
      content: lib.observacoes || " ",
      colSpan: projeto ? 2 : 1,
      styles: { minCellHeight: projeto ? 16 : 22, valign: "top", fontSize: 9 },
    },
  ]);
  autoTable(doc, {
    startY: y,
    body: obsRows,
    theme: "grid",
    margin: { left: margin, right: margin },
    styles: { font: "helvetica", cellPadding: 1.8, lineColor: BORDER, lineWidth: 0.2 },
    columnStyles: projeto ? { 0: { cellWidth: 42 } } : {},
  });
  y = lastY();
  band(`* ${info.anexo}`, DANGER, 255, 8, 6.5);

  // Footer
  const issued = new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED_TEXT);
    doc.text(`Patty One - Liberação nº ${lib.numero} - emitido em ${issued}`, margin, pageH - 5);
    doc.text(`Página ${i} de ${pages}`, pageW - margin, pageH - 5, { align: "right" });
  }

  const slug = lib.cliente
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  doc.save(`liberacao-${lib.numero}${slug ? `-${slug}` : ""}.pdf`);
}
