import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { dbError } from "./db-errors";
import { totaisVenda } from "./comercial-rules";
import {
  DIAS_AGENDA_VISITAS,
  JANELA_RENOVACAO_DIAS,
  POS_VENDA_ATE,
  montarEntradaSkillComercial,
  type EntradaSkillComercial,
  type OcupacaoOutdoorSkill,
  type PedidoLiberacaoSkill,
  type VendaSkill,
} from "./skill-comercial";

// Loads what the claude.ai "skill-comercial" reads. Tables are newer than the generated types.
const db = supabase as unknown as SupabaseClient;
type Row = Record<string, unknown>;
const txt = (v: unknown) => (typeof v === "string" ? v : "");
const txtOuNull = (v: unknown) => (typeof v === "string" && v !== "" ? v : null);
const num = (v: unknown) => (v === null || v === undefined || v === "" ? 0 : Number(v));

async function rows(
  query: PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>,
): Promise<Row[]> {
  const { data, error } = await query;
  if (error) throw dbError(error);
  return (data ?? []) as Row[];
}

/** `.in()` in batches, so long id lists don't overflow the request URL. */
async function emLotes(
  ids: string[],
  consulta: (
    lote: string[],
  ) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>,
): Promise<Row[]> {
  const lotes: string[][] = [];
  for (let i = 0; i < ids.length; i += 100) lotes.push(ids.slice(i, i + 100));
  return (await Promise.all(lotes.map((l) => rows(consulta(l))))).flat();
}

function somaDias(data: string, dias: number): string {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

const mesCurto = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];
const rotuloCi = (numero: number, mes: string) =>
  `${numero}/${mesCurto[Number(mes.slice(5, 7)) - 1] ?? ""}`;

export const skillComercialRepository = {
  /** `vendedor` "" = everyone's portfolio. */
  async entrada(hoje: string, vendedor: string): Promise<EntradaSkillComercial> {
    const ate = somaDias(hoje, JANELA_RENOVACAO_DIAS);
    const [vinhetas, paineis, ciPend, bissemanas, vendas, visitas, ordens] = await Promise.all([
      rows(
        db
          .from("painel_vinhetas")
          .select("painel_id, cliente, ci, tipo, inicio, fim, representante_nome")
          .is("retirada_em", null)
          .lte("fim", ate),
      ),
      rows(db.from("paineis").select("id, codigo, nome")),
      rows(
        db
          .from("ci_paineis")
          .select("painel_id, cis(numero, mes, cliente)")
          .eq("status", "pendente")
          .eq("renovacao", true),
      ),
      rows(
        db
          .from("calendario_bissemanas")
          .select("ano, numero, inicio, fim")
          .gte("fim", somaDias(hoje, -14))
          .lte("inicio", somaDias(ate, 28)),
      ),
      rows(
        db
          .from("vendas")
          .select(
            "id, tipo, numero, cadastro_id, vendedor, status, validade, desconto, updated_at, proposta_id",
          )
          .or(
            'and(tipo.eq.proposta,status.eq.Enviada),and(tipo.eq.pedido,status.in.(Aberto,"Em andamento"))',
          ),
      ),
      rows(
        db
          .from("visitas")
          .select(
            "numero, cliente, status, agendada_para, data_sugerida, descricao, endereco, responsavel_nome, vendedor",
          )
          .in("status", ["solicitada", "agendada"]),
      ),
      rows(
        db
          .from("ordens_producao")
          .select("numero, cadastro_id, descricao, data_conclusao, venda_id, cliente_confirmou_em")
          .eq("status", "Concluída")
          .gte("data_conclusao", `${somaDias(hoje, -POS_VENDA_ATE - 1)}T00:00:00Z`),
      ),
    ]);
    const painelPorId = new Map(paineis.map((p) => [txt(p["id"]), p]));

    // Outdoors: occupancy in the bi-weeks around the window.
    const ocupacoes = bissemanas.length
      ? await rows(
          db
            .from("pontos_ocupacao")
            .select("ponto_id, ano, bissemana, cliente")
            .or(
              bissemanas
                .map((b) => `and(ano.eq.${num(b["ano"])},bissemana.eq.${num(b["numero"])})`)
                .join(","),
            ),
        )
      : [];
    const pontos = await emLotes([...new Set(ocupacoes.map((o) => txt(o["ponto_id"])))], (l) =>
      db.from("pontos_midia").select("id, codigo, nome").in("id", l),
    );
    const pontoPorId = new Map(pontos.map((p) => [txt(p["id"]), p]));
    const bissemanaPor = new Map(
      bissemanas.map((b) => [`${num(b["ano"])}|${num(b["numero"])}`, b]),
    );
    const outdoor: OcupacaoOutdoorSkill[] = ocupacoes.flatMap((o) => {
      const b = bissemanaPor.get(`${num(o["ano"])}|${num(o["bissemana"])}`);
      const p = pontoPorId.get(txt(o["ponto_id"]));
      if (!b || !p) return [];
      return [
        {
          pontoCodigo: txt(p["codigo"]) || txt(p["nome"]),
          pontoNome: txt(p["nome"]),
          cliente: txt(o["cliente"]),
          inicio: txt(b["inicio"]),
          fim: txt(b["fim"]),
        },
      ];
    });

    // Sales: items for totals, clients, and what each pedido already has.
    const vendaIds = vendas.map((v) => txt(v["id"]));
    const pedidoIds = vendas.filter((v) => v["tipo"] === "pedido").map((v) => txt(v["id"]));
    const propostaDosPedidos = vendas
      .filter((v) => v["tipo"] === "pedido" && v["proposta_id"])
      .map((v) => txt(v["proposta_id"]));
    const alvoVinculo = [...new Set([...pedidoIds, ...propostaDosPedidos])];
    const cadIds = [
      ...new Set([...vendas, ...ordens].map((v) => txt(v["cadastro_id"])).filter(Boolean)),
    ];
    const vendaDasOrdens = [...new Set(ordens.map((o) => txt(o["venda_id"])).filter(Boolean))];
    const [itens, cadastros, liberacoes, contas, briefings, visitasLig, vendasOrdens] =
      await Promise.all([
        emLotes(vendaIds, (l) =>
          db
            .from("vendas_itens")
            .select("venda_id, ordem, descricao, quantidade, valor_unitario, desconto")
            .in("venda_id", l),
        ),
        emLotes(cadIds, (l) =>
          db.from("cadastros").select("id, nome, contato, celular, telefone").in("id", l),
        ),
        emLotes(pedidoIds, (l) => db.from("liberacoes").select("venda_id").in("venda_id", l)),
        emLotes(pedidoIds, (l) =>
          db.from("contas_receber").select("venda_id, status").in("venda_id", l),
        ),
        emLotes(alvoVinculo, (l) =>
          db.from("briefings").select("venda_id, status").in("venda_id", l),
        ),
        emLotes(alvoVinculo, (l) =>
          db.from("visitas").select("venda_id, status").in("venda_id", l),
        ),
        emLotes(vendaDasOrdens, (l) => db.from("vendas").select("id, vendedor").in("id", l)),
      ]);
    const cadastro = new Map(cadastros.map((c) => [txt(c["id"]), c]));
    const contatoDe = (c: Row | undefined) =>
      c
        ? [txt(c["contato"]), txt(c["celular"]) || txt(c["telefone"])].filter(Boolean).join(" ")
        : "";

    const toVenda = (v: Row): VendaSkill => {
      const id = txt(v["id"]);
      const seus = itens
        .filter((i) => i["venda_id"] === id)
        .sort((a, b) => num(a["ordem"]) - num(b["ordem"]));
      const c = cadastro.get(txt(v["cadastro_id"]));
      return {
        numero: num(v["numero"]),
        cliente: txt(c?.["nome"]),
        contato: contatoDe(c),
        vendedor: txt(v["vendedor"]),
        status: txt(v["status"]),
        total: totaisVenda(
          seus.map((i) => ({
            quantidade: num(i["quantidade"]),
            valorUnitario: num(i["valor_unitario"]),
            desconto: num(i["desconto"]),
          })),
          num(v["desconto"]),
        ).total,
        descricao: seus
          .map((i) => txt(i["descricao"]))
          .filter(Boolean)
          .join(" + "),
        atualizadoEm: txt(v["updated_at"]),
        validade: txtOuNull(v["validade"]),
      };
    };
    /** true when any is done, false when there are some but none done, null when none. */
    const algum = (lista: Row[], ids: string[], feito: (r: Row) => boolean): boolean | null => {
      const daqui = lista.filter((r) => ids.includes(txt(r["venda_id"])));
      return daqui.length ? daqui.some(feito) : null;
    };
    const pedidos: PedidoLiberacaoSkill[] = vendas
      .filter((v) => v["tipo"] === "pedido")
      .map((v) => {
        const id = txt(v["id"]);
        const ids = [id, txt(v["proposta_id"])].filter(Boolean);
        return {
          ...toVenda(v),
          temLiberacao: liberacoes.some((l) => l["venda_id"] === id),
          sinalPago: algum(
            contas.filter((c) => c["status"] !== "Cancelado"),
            [id],
            (c) => c["status"] === "Recebido",
          ),
          arteOk: algum(briefings, ids, (b) => b["status"] === "concluido"),
          medidaConferida: algum(
            visitasLig.filter((x) => x["status"] !== "cancelada"),
            ids,
            (x) => x["status"] === "realizada",
          ),
        };
      });
    const vendedorDaVenda = new Map(vendasOrdens.map((v) => [txt(v["id"]), txt(v["vendedor"])]));

    return montarEntradaSkillComercial({
      hoje,
      agora: new Date(),
      vendedor: vendedor.trim(),
      vinhetas: vinhetas.map((v) => {
        const p = painelPorId.get(txt(v["painel_id"]));
        return {
          painelCodigo: txt(p?.["codigo"]),
          painelNome: txt(p?.["nome"]),
          cliente: txt(v["cliente"]),
          ci: txt(v["ci"]),
          tipo: txt(v["tipo"]),
          inicio: txtOuNull(v["inicio"]),
          fim: txtOuNull(v["fim"]),
          representanteNome: txt(v["representante_nome"]),
        };
      }),
      renovacoesPendentes: ciPend.map((c) => {
        const ci = (Array.isArray(c["cis"]) ? c["cis"][0] : c["cis"]) as Row | undefined;
        return {
          painelCodigo: txt(painelPorId.get(txt(c["painel_id"]))?.["codigo"]),
          cliente: txt(ci?.["cliente"]),
          ciRotulo: ci ? rotuloCi(num(ci["numero"]), txt(ci["mes"])) : "",
        };
      }),
      outdoor,
      propostas: vendas.filter((v) => v["tipo"] === "proposta").map(toVenda),
      pedidos,
      visitas: visitas
        .filter(
          (v) =>
            v["status"] !== "agendada" ||
            txt(v["agendada_para"]) <= `${somaDias(hoje, DIAS_AGENDA_VISITAS + 1)}`,
        )
        .map((v) => ({
          numero: num(v["numero"]),
          cliente: txt(v["cliente"]),
          status: txt(v["status"]),
          agendadaPara: txtOuNull(v["agendada_para"]),
          dataSugerida: txtOuNull(v["data_sugerida"]),
          descricao: txt(v["descricao"]),
          endereco: txt(v["endereco"]),
          responsavelNome: txt(v["responsavel_nome"]),
          vendedor: txt(v["vendedor"]),
        })),
      ordensConcluidas: ordens.map((o) => ({
        numero: num(o["numero"]),
        cliente: txt(cadastro.get(txt(o["cadastro_id"]))?.["nome"]),
        descricao: txt(o["descricao"]),
        concluidaEm: txt(o["data_conclusao"]),
        vendedor: vendedorDaVenda.get(txt(o["venda_id"])) ?? "",
        clienteConfirmouEm: txtOuNull(o["cliente_confirmou_em"]),
      })),
    });
  },
};
