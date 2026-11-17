/** Approval e-mail of a liberação (subject + HTML body). Pure: used on the server. */

export interface EmailLiberacaoDados {
  numero: number;
  modelo: "projeto" | "midia";
  cliente: string;
  responsavel: string;
  contato: string;
  endereco: string;
  vendedor: string;
  dataEntrega: string | null;
  decididoPorNome: string;
  observacoes: string;
  itens: {
    servico: string;
    insumos: string;
    acabamento: string;
    instalacao: string;
    detalhes: string;
    largura: number | null;
    altura: number | null;
    quantidade: number | null;
  }[];
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const num = (n: number | null) =>
  n === null ? "" : n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

function dataBR(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

export function montarEmailLiberacao(
  lib: EmailLiberacaoDados,
  link: string,
): { subject: string; html: string } {
  const subject = `Liberação nº ${lib.numero} aprovada${lib.cliente ? ` - ${lib.cliente}` : ""}`;
  const modelo = lib.modelo === "midia" ? "Mídia" : "Projetos";
  const midiaLabel = lib.modelo === "midia" ? "Mídia" : "Insumos";

  const linha = (rotulo: string, valor: string) =>
    valor.trim()
      ? `<tr><td style="padding:2px 12px 2px 0;color:#69695f">${esc(rotulo)}</td><td style="padding:2px 0"><b>${esc(valor)}</b></td></tr>`
      : "";

  const itens = lib.itens.filter(
    (i) =>
      [i.servico, i.insumos, i.acabamento, i.instalacao, i.detalhes].some((v) => v.trim()) ||
      i.quantidade !== null,
  );
  const th = (t: string) =>
    `<th style="background:#256550;color:#fff;padding:6px 8px;text-align:left;font-size:12px">${t}</th>`;
  const td = (t: string, right = false) =>
    `<td style="border-bottom:1px solid #cdcdc6;padding:6px 8px;font-size:12px;vertical-align:top${right ? ";text-align:right;white-space:nowrap" : ""}">${esc(t)}</td>`;
  const tabela = itens.length
    ? `<table cellspacing="0" style="border-collapse:collapse;width:100%;margin-top:12px">
<tr>${th("Serviço")}${th(midiaLabel)}${th("Acabamento")}${th("Instalação")}${th("Detalhes")}${th("Tamanho (cm)")}${th("Qtda")}</tr>
${itens
  .map(
    (i) =>
      `<tr>${td(i.servico)}${td(i.insumos)}${td(i.acabamento)}${td(i.instalacao)}${td(i.detalhes)}${td(
        i.largura !== null || i.altura !== null ? `${num(i.largura)} x ${num(i.altura)}` : "",
        true,
      )}${td(num(i.quantidade), true)}</tr>`,
  )
  .join("\n")}
</table>`
    : "";

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#1f1f1c;max-width:760px">
<div style="background:#daf2e8;border-left:4px solid #256550;padding:12px 16px;font-size:16px">
<b>Liberação nº ${lib.numero} aprovada</b>${lib.decididoPorNome ? ` por ${esc(lib.decididoPorNome)}` : ""}
</div>
<table style="margin-top:12px;font-size:14px">
${linha("Cliente", lib.cliente)}
${linha("Modelo", modelo)}
${linha("Entrega", dataBR(lib.dataEntrega))}
${linha("Responsável", lib.responsavel)}
${linha("Contato", lib.contato)}
${linha("Endereço", lib.endereco)}
${linha("Vendedor", lib.vendedor)}
</table>
${tabela}
${lib.observacoes.trim() ? `<p style="font-size:13px;margin-top:12px"><b>Observações:</b> ${esc(lib.observacoes)}</p>` : ""}
<p style="margin-top:20px"><a href="${esc(link)}" style="background:#256550;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;font-size:14px">Abrir no Patty One</a></p>
<p style="font-size:12px;color:#69695f;margin-top:16px">O PDF completo da liberação está em anexo. E-mail automático do Patty One.</p>
</div>`;

  return { subject, html };
}
