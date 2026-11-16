import { formatTamanho, isBlankLiberacaoItem, LIBERACAO_MODELO_LABEL } from "@/lib/data/rules";
import type { Liberacao } from "@/lib/data/types";
import { formatDateOnly } from "@/lib/format";

const BRAND: [number, number, number] = [31, 95, 74];
const MUTED: [number, number, number] = [110, 110, 110];

/** Builds the liberação sheet (A4 landscape) and triggers the download (browser only). */
export async function downloadLiberacaoPdf(lib: Liberacao, logoUrl?: string): Promise<void> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 12;
  let y = 14;

  // Logo (optional; skipped if it can't be loaded)
  let textX = margin;
  if (logoUrl) {
    try {
      const blob = await (await fetch(logoUrl)).blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = reject;
        r.readAsDataURL(blob);
      });
      doc.addImage(dataUrl, "PNG", margin, y - 6, 16, 16);
      textX = margin + 20;
    } catch {
      /* no logo */
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(20, 20, 20);
  doc.text(`LIBERAÇÃO Nº ${lib.numero}`, textX, y);
  doc.setFontSize(10);
  doc.setTextColor(...BRAND);
  doc.text(`Modelo ${LIBERACAO_MODELO_LABEL[lib.modelo].toUpperCase()}`, textX, y + 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(
    `Emitido em ${new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`,
    pageW - margin,
    y,
    { align: "right" },
  );
  y += 14;

  const date = (d: string | null) => (d ? formatDateOnly(d) : "");
  const fields: [string, string][] = [
    ["NOME DO CLIENTE", lib.cliente],
    ["VENDEDOR", lib.vendedor],
    ["PROJETISTA", lib.projetista],
    ["DATA DA LIBERAÇÃO", date(lib.dataLiberacao)],
    ["DATA DA ENTREGA", date(lib.dataEntrega)],
    ...(lib.modelo === "projeto"
      ? ([
          ["RESPONSÁVEL (CLIENTE)", lib.responsavel],
          ["TELEFONE (CLIENTE)", lib.telefone],
          ["ENDEREÇO", lib.endereco],
        ] as [string, string][])
      : ([
          ["BISSEMANA", lib.bissemana],
          ["NÚMERO DA PLACA", lib.numeroPlaca],
        ] as [string, string][])),
  ];

  // Header block: 2 label/value pairs per row
  const rows: string[][] = [];
  for (let i = 0; i < fields.length; i += 2) {
    const a = fields[i] as [string, string];
    const b = fields[i + 1];
    rows.push([a[0], a[1], b?.[0] ?? "", b?.[1] ?? ""]);
  }
  autoTable(doc, {
    startY: y,
    body: rows,
    theme: "grid",
    margin: { left: margin, right: margin },
    styles: { font: "helvetica", fontSize: 9, cellPadding: 2, lineColor: [200, 200, 200] },
    columnStyles: {
      0: { fontStyle: "bold", textColor: MUTED, cellWidth: 45, fillColor: [244, 246, 245] },
      1: { cellWidth: (pageW - margin * 2) / 2 - 45 },
      2: { fontStyle: "bold", textColor: MUTED, cellWidth: 45, fillColor: [244, 246, 245] },
    },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

  const itens = lib.itens.filter((i) => !isBlankLiberacaoItem(i));
  autoTable(doc, {
    startY: y,
    head: [
      [
        "#",
        "SERVIÇO",
        "MATERIAL",
        "ACABAMENTO",
        "INSTALAÇÃO",
        "DETALHES",
        "TAMANHO (CM)\nL x A",
        "CHECK",
      ],
    ],
    body: itens.length
      ? itens.map((i, n) => [
          n + 1,
          i.servico,
          i.material,
          i.acabamento,
          i.instalacao,
          i.detalhes,
          formatTamanho(i.larguraCm, i.alturaCm).replace("—", "-"),
          i.checked ? "OK" : "",
        ])
      : [[{ content: "Nenhum item.", colSpan: 8 }]],
    theme: "grid",
    margin: { left: margin, right: margin },
    styles: {
      font: "helvetica",
      fontSize: 9,
      cellPadding: 2,
      lineColor: [200, 200, 200],
      valign: "top",
    },
    headStyles: {
      fillColor: BRAND,
      textColor: 255,
      fontStyle: "bold",
      fontSize: 8,
      valign: "middle",
    },
    didParseCell: (data) => {
      if (data.section === "head" && data.column.index >= 6) data.cell.styles.halign = "center";
    },
    columnStyles: {
      0: { cellWidth: 8, halign: "center" },
      6: { cellWidth: 34, halign: "center" },
      7: { cellWidth: 16, halign: "center", fontStyle: "bold", textColor: BRAND },
    },
  });

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    const h = doc.internal.pageSize.getHeight();
    doc.text(`Patty · Liberação nº ${lib.numero} · ${lib.cliente}`, margin, h - 6);
    doc.text(`Página ${i} de ${pages}`, pageW - margin, h - 6, { align: "right" });
  }

  const slug = lib.cliente
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  doc.save(`liberacao-${lib.numero}${slug ? `-${slug}` : ""}.pdf`);
}
