import type { CellInput, RowInput } from "jspdf-autotable";
import type { SimNao, Visita } from "@/lib/data/cloud-visitas";
import { LOCAL_MEDIDA, PISOS, SUPERFICIES, VOLTAGENS } from "@/lib/data/cloud-visitas";
import { formatDateOnly } from "@/lib/format";

type RGB = [number, number, number];
const PRIMARY: RGB = [37, 101, 80];
const BAND: RGB = [218, 242, 232];
const LABEL_BG: RGB = [241, 240, 236];
const MUTED: RGB = [105, 105, 100];
const BORDER: RGB = [205, 205, 198];

const box = (on: boolean) => (on ? "[X]" : "[  ]");
const simNao = (v: SimNao) => `${box(v === "sim")} SIM    ${box(v === "nao")} NÃO`;

function dataHora(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "VISITA TÉCNICA/MEDIDAS" sheet (A4 portrait, same blocks as the paper model). */
export async function downloadVisitaPdf(v: Visita, logoUrl?: string): Promise<void> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 10;
  const width = pageW - margin * 2;
  let y = margin;
  const lastY = () =>
    (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

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
  doc.rect(margin, y, width, 12, "F");
  if (logo) doc.addImage(logo, "PNG", margin + 2, y + 1, 10, 10);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(255);
  doc.text(`VISITA TÉCNICA/MEDIDAS - Nº ${v.numero}`, pageW / 2, y + 8, { align: "center" });
  y += 14;

  const base = {
    theme: "grid" as const,
    margin: { left: margin, right: margin },
    styles: {
      font: "helvetica",
      fontSize: 8.5,
      cellPadding: 1.8,
      lineColor: BORDER,
      lineWidth: 0.2,
      valign: "middle" as const,
      textColor: [20, 20, 20] as RGB,
    },
  };
  const L = (t: string, colSpan = 1): CellInput => ({
    content: t.toUpperCase(),
    colSpan,
    styles: { fillColor: LABEL_BG, textColor: MUTED, fontStyle: "bold", fontSize: 7 },
  });
  const V = (t: string, colSpan = 1): CellInput => ({
    content: t,
    colSpan,
    styles: { fontStyle: "bold" },
  });
  const H = (t: string, colSpan = 1): CellInput => ({
    content: t.toUpperCase(),
    colSpan,
    styles: {
      fillColor: BAND,
      textColor: PRIMARY,
      fontStyle: "bold",
      halign: "center",
      fontSize: 8.5,
    },
  });

  const vi = v.vistoria;
  const data = v.agendadaPara
    ? dataHora(v.agendadaPara)
    : v.dataSugerida
      ? formatDateOnly(v.dataSugerida)
      : "";

  // Header
  const header: RowInput[] = [
    [
      L("Data"),
      V(data),
      L("Vendedor"),
      V(v.vendedor),
      L("Responsável visita"),
      V(v.responsavelNome),
    ],
    [L("Cliente"), V(v.cliente, 3), L("Contato / telefone"), V(v.contato)],
    [L("Endereço"), V(v.endereco, 3), L("Referência local"), V(v.referenciaLocal)],
    [H("* Descrição medidas a serem realizadas", 6)],
    [{ content: v.descricao || " ", colSpan: 6, styles: { minCellHeight: 22, valign: "top" } }],
    [L("Avaliação andamento da obra", 2), { content: vi.avaliacaoObra, colSpan: 4 }],
    [
      L("Local da medida feita foi", 2),
      {
        content: LOCAL_MEDIDA.map(
          (o) => `${box(vi.localMedida.includes(o))} ${o.toUpperCase()}`,
        ).join("      "),
        colSpan: 4,
      },
    ],
    [
      L("Limpeza local de instalação", 2),
      { content: simNao(vi.limpeza), colSpan: 2 },
      { content: `${box(vi.retiradaMaterialVelho)} RETIRADA MATERIAL VELHO`, colSpan: 2 },
    ],
    [L("Trabalho em altura", 2), { content: simNao(vi.trabalhoAltura), colSpan: 4 }],
    [
      L("Escada (altura)"),
      V(vi.escadaAltura),
      L("Cinto segurança"),
      { content: simNao(vi.cintoSeguranca) },
      L("Munck (altura)"),
      V(vi.munckAltura),
    ],
  ];
  autoTable(doc, {
    ...base,
    startY: y,
    body: header,
    columnStyles: {
      0: { cellWidth: 28 },
      1: { cellWidth: 38 },
      2: { cellWidth: 26 },
      3: { cellWidth: 34 },
      4: { cellWidth: 30 },
      5: { cellWidth: width - 156 },
    },
  });
  y = lastY() + 3;

  // Parede / andaime / piso
  const n = Math.max(SUPERFICIES.length, 6);
  const andaime = [
    simNao(vi.andaime),
    `JOGOS - QUANT. ${vi.andaimeJogos || "___"}`,
    `SAPATA - QUANT. ${vi.andaimeSapata || "___"}`,
    `TÁBUAS - QUANT. ${vi.andaimeTabuas || "___"}`,
    `RODINHAS - QUANT. ${vi.andaimeRodinhas || "___"}`,
  ];
  const corpo: RowInput[] = [[H("Parede / superfície"), H("Andaime"), H("Tipo piso")]];
  for (let i = 0; i < n; i++) {
    const sup = SUPERFICIES[i];
    const piso = PISOS[i];
    corpo.push([
      sup ? `${box(vi.superficies.includes(sup))} ${sup.toUpperCase()}` : "",
      andaime[i] ?? "",
      piso ? `${box(vi.piso.includes(piso))} ${piso.toUpperCase()}` : "",
    ]);
  }
  autoTable(doc, {
    ...base,
    startY: y,
    body: corpo,
    columnStyles: {
      0: { cellWidth: width / 3 },
      1: { cellWidth: width / 3 },
      2: { cellWidth: width / 3 },
    },
  });
  y = lastY() + 3;

  // Elétrica
  autoTable(doc, {
    ...base,
    startY: y,
    body: [
      [H("Parte elétrica", 4)],
      [H("Tipo voltagem"), H("Tomada"), H("Extensão"), H("Ponto energia")],
      [
        VOLTAGENS.map((o) => `${box(vi.voltagem.includes(o))} ${o}`).join("    "),
        simNao(vi.tomada),
        simNao(vi.extensao),
        simNao(vi.pontoEnergia),
      ],
      [L("Tamanho necessário (extensão)", 2), { content: vi.tamanhoExtensao, colSpan: 2 }],
    ],
    columnStyles: {
      0: { cellWidth: width / 4 },
      1: { cellWidth: width / 4 },
      2: { cellWidth: width / 4 },
      3: { cellWidth: width / 4 },
    },
  });
  y = lastY() + 3;

  // Dificuldades
  autoTable(doc, {
    ...base,
    startY: y,
    body: [
      [H("Dificuldades encontradas")],
      [{ content: vi.dificuldades || " ", styles: { minCellHeight: 24, valign: "top" } }],
      [H("Fotografar os espaços - *obrigatório")],
      [
        {
          content: "As fotos estão nos anexos da visita no Patty One (Google Drive).",
          styles: { textColor: MUTED, fontStyle: "italic" },
        },
      ],
    ],
  });

  const issued = new Date().toLocaleString("pt-BR");
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    const status =
      v.status === "realizada" && v.realizadaEm
        ? ` - realizada em ${dataHora(v.realizadaEm)} por ${v.realizadaPorNome}`
        : "";
    doc.text(
      `Patty One - Visita técnica nº ${v.numero}${status} - emitido em ${issued}`,
      margin,
      pageH - 5,
    );
    doc.text(`Página ${i} de ${pages}`, pageW - margin, pageH - 5, { align: "right" });
  }

  const slug = v.cliente
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  doc.save(`visita-${v.numero}${slug ? `-${slug}` : ""}.pdf`);
}
