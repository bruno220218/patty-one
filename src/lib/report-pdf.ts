import {
  formatHoras,
  type Indicators,
  type LiberacaoIndicators,
  type ReportPeriod,
} from "@/lib/data/report";
import { formatDateOnly } from "@/lib/format";

const BRAND: [number, number, number] = [31, 95, 74];
const MUTED: [number, number, number] = [110, 110, 110];
const DANGER: [number, number, number] = [185, 28, 28];

const date = (d: string | null) => (d ? formatDateOnly(d) : "Sem prazo");

/** Builds the indicators report and triggers the download (browser only). */
export async function downloadIndicatorsPdf(
  ind: Indicators,
  period: ReportPeriod,
  issuedBy: string,
  lib?: LiberacaoIndicators | null,
): Promise<void> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;
  let y = 18;

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...BRAND);
  doc.text("Patty One", margin, y);
  doc.setFontSize(13);
  doc.setTextColor(20, 20, 20);
  doc.text("Relatório de indicadores", margin, (y += 8));
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  const issued = new Date().toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  doc.text(`Período: ${period.label}`, margin, (y += 6));
  doc.text(`Emitido em ${issued} por ${issuedBy}`, margin, (y += 5));
  doc.setDrawColor(...BRAND);
  doc.setLineWidth(0.6);
  doc.line(margin, (y += 4), pageW - margin, y);

  // KPI tiles
  const kpis: [string, number][] = [
    ["Clientes", ind.clients.count],
    ["Tarefas feitas", ind.tasksTotal],
    ["Entregues no prazo", ind.onTime.length],
    ["Entregues atrasados", ind.late.length],
    ["Não finalizados", ind.open.length],
  ];
  const gap = 3;
  const tileW = (pageW - margin * 2 - gap * (kpis.length - 1)) / kpis.length;
  y += 6;
  kpis.forEach(([label, value], i) => {
    const x = margin + i * (tileW + gap);
    doc.setFillColor(242, 246, 244);
    doc.roundedRect(x, y, tileW, 20, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(...(label === "Entregues atrasados" && value > 0 ? DANGER : BRAND));
    doc.text(String(value), x + tileW / 2, y + 10, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(label, x + tileW / 2, y + 16, { align: "center" });
  });
  y += 28;

  const delivered = ind.onTime.length + ind.late.length;
  if (delivered > 0) {
    const rate = Math.round((ind.onTime.length / delivered) * 100);
    doc.setFontSize(9.5);
    doc.setTextColor(40, 40, 40);
    doc.text(
      `Pontualidade: ${rate}% das entregas com prazo saíram no prazo (${ind.onTime.length} de ${delivered}).`,
      margin,
      y,
    );
    y += 6;
  }

  const section = (title: string, subtitle?: string) => {
    // Keep a heading together with the start of its table.
    if (y > 235) {
      doc.addPage();
      y = 18;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(20, 20, 20);
    doc.text(title, margin, (y += 4));
    if (subtitle) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(...MUTED);
      doc.text(subtitle, margin, (y += 4.5));
    }
    y += 2;
  };

  const table = (head: string[], body: (string | number)[][], empty: string, lateCol?: number) => {
    autoTable(doc, {
      startY: y,
      head: [head],
      body: body.length ? body : [[{ content: empty, colSpan: head.length }]],
      margin: { left: margin, right: margin },
      styles: { font: "helvetica", fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: BRAND, textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 248, 246] },
      didParseCell: (data) => {
        if (!body.length && data.section === "body") {
          data.cell.styles.textColor = MUTED;
          data.cell.styles.fontStyle = "italic";
        }
        if (lateCol !== undefined && data.section === "body" && data.column.index === lateCol) {
          const raw = String(data.cell.raw ?? "");
          if (raw.startsWith("+") || raw === "Atrasado") data.cell.styles.textColor = DANGER;
        }
      },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  };

  section("Clientes no período", "Projetos criados no período (nomes iguais contam uma vez).");
  table(
    ["#", "Cliente"],
    ind.clients.names.map((n, i) => [i + 1, n]),
    "Nenhum cliente novo no período.",
  );

  section("Tarefas por colaborador", "Tarefas concluídas no período.");
  table(
    ["Colaborador", "Tarefas", "% do total"],
    ind.tasksByPerson.map((p) => [
      p.name,
      p.count,
      `${ind.tasksTotal ? Math.round((p.count / ind.tasksTotal) * 100) : 0}%`,
    ]),
    "Nenhuma tarefa concluída no período.",
  );

  const deliveredRows = (rows: Indicators["onTime"]) =>
    rows.map((r) => [
      r.name,
      r.serviceType || "-",
      date(r.dueDate),
      formatDateOnly(r.deliveredOn),
      r.daysLate === null
        ? "-"
        : r.daysLate > 0
          ? `+${r.daysLate} ${r.daysLate === 1 ? "dia" : "dias"}`
          : r.daysLate === 0
            ? "No dia"
            : `${-r.daysLate} ${r.daysLate === -1 ? "dia" : "dias"} antes`,
    ]);
  const deliveredHead = ["Projeto", "Serviço", "Prazo", "Entregue em", "Diferença"];

  section(
    "Serviços entregues no prazo",
    "Todas as tarefas concluídas até o prazo. Data de entrega = última tarefa concluída.",
  );
  table(deliveredHead, deliveredRows(ind.onTime), "Nenhuma entrega no prazo no período.");

  section("Serviços entregues atrasados");
  table(deliveredHead, deliveredRows(ind.late), "Nenhuma entrega atrasada no período.", 4);

  if (ind.noDueDate.length > 0) {
    section("Serviços entregues sem prazo definido");
    table(deliveredHead, deliveredRows(ind.noDueDate), "");
  }

  section("Serviços ainda não finalizados", "Situação na data de emissão.");
  table(
    ["Projeto", "Serviço", "Prazo", "Produção", "Situação"],
    ind.open.map((r) => [
      r.name,
      r.serviceType || "-",
      date(r.dueDate),
      `${r.percent}% (${r.done}/${r.total})`,
      r.overdue ? "Atrasado" : "No prazo",
    ]),
    "Todos os serviços foram finalizados.",
    4,
  );

  if (lib) {
    section(
      "Liberações",
      "Criadas, aprovadas e reprovadas no período; fila e edição na data de emissão.",
    );
    const decididas = lib.aprovadas + lib.reprovacoes;
    table(
      ["Indicador", "Valor"],
      [
        ["Liberações criadas", lib.criadas],
        ["Aprovadas (viraram projeto)", lib.aprovadas],
        ["Reprovações", lib.reprovacoes],
        [
          "Aprovadas de primeira (sem reprovação)",
          lib.aprovadas
            ? `${lib.aprovadasDePrimeira} de ${lib.aprovadas} (${Math.round((lib.aprovadasDePrimeira / lib.aprovadas) * 100)}%)`
            : "-",
        ],
        [
          "Taxa de reprovação",
          decididas ? `${Math.round((lib.reprovacoes / decididas) * 100)}%` : "-",
        ],
        ["Tempo médio na fila do PCP", formatHoras(lib.horasMediasNaFila).replace("—", "-")],
        ["Na fila do PCP agora", lib.naFilaAgora],
        ["Em edição agora (reprovadas)", lib.emEdicaoAgora],
      ],
      "",
    );
    if (lib.maisReprovadas.length > 0) {
      section("Liberações mais reprovadas no período");
      table(
        ["Nº", "Cliente", "Reprovações"],
        lib.maisReprovadas.map((r) => [r.numero, r.cliente, r.vezes]),
        "",
      );
    }
  }

  // Footer with page numbers
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(`Patty One · ${period.label}`, margin, 290);
    doc.text(`Página ${i} de ${pages}`, pageW - margin, 290, { align: "right" });
  }

  const slug = period.from ? period.from.slice(0, 7) : "todo-periodo";
  doc.save(`relatorio-indicadores-${slug}.pdf`);
}
