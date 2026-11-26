import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { dbError } from "./db-errors";
import { hojeISO } from "./planejamento-rules";
import {
  DIAS_CONCLUIDOS_VISIVEIS,
  etapaAtualDaOrdem,
  programacaoDaOrdem,
  type DataProgramada,
} from "./status-servicos-rules";

// The operação tables are newer than the generated database types; each one is read on its
// own and joined here (as in cloud-operacao.ts).
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

/** `.in()` in batches, so a long id list doesn't overflow the request URL. */
async function emLotes(
  ids: string[],
  consulta: (lote: string[]) => PromiseLike<{
    data: unknown;
    error: { message: string; code?: string } | null;
  }>,
): Promise<Row[]> {
  const unicos = [...new Set(ids.filter(Boolean))];
  const lotes: string[][] = [];
  for (let i = 0; i < unicos.length; i += 100) lotes.push(unicos.slice(i, i + 100));
  return (await Promise.all(lotes.map((l) => rows(consulta(l))))).flat();
}

/** One production order as Comercial follows it (Status Serviços, etapa 8). */
export interface ServicoOrdem {
  id: string;
  numero: number;
  status: string;
  descricao: string;
  cliente: string;
  vendedor: string;
  pedidoNumero: number | null;
  liberacaoNumero: number | null;
  motivoSemPedido: string;
  dataPrevista: string | null;
  etapaAtual: string | null;
  etapasConcluidas: number;
  totalEtapas: number;
  equipe: string[];
  programacao: (DataProgramada & { proxima: boolean }) | null;
  fotos: { id: string; nome: string; url: string }[];
}

export const statusServicosRepository = {
  /** Open orders plus the ones finished in the last 30 days (cancelled ones are left out). */
  async ordens(): Promise<ServicoOrdem[]> {
    const desde = new Date(Date.now() - DIAS_CONCLUIDOS_VISIVEIS * 86_400_000).toISOString();
    const base = await rows(
      db
        .from("ordens_producao")
        .select(
          "id, numero, status, descricao, data_prevista, venda_id, liberacao_id, cadastro_id, motivo_sem_pedido",
        )
        .neq("status", "Cancelada")
        .or(`status.neq.Concluída,data_conclusao.gte."${desde}"`)
        .order("numero", { ascending: false })
        .limit(1000),
    );
    if (!base.length) return [];
    const ids = base.map((o) => txt(o["id"]));

    const [etapas, equipe, vendas, libs, cads, servicos] = await Promise.all([
      emLotes(ids, (l) =>
        db
          .from("ordens_producao_etapas")
          .select("ordem_id, ordem, nome, concluido")
          .in("ordem_id", l),
      ),
      emLotes(ids, (l) =>
        db.from("ordens_producao_equipe").select("ordem_id, colaborador_id").in("ordem_id", l),
      ),
      emLotes(
        base.map((o) => txt(o["venda_id"])),
        (l) => db.from("vendas").select("id, numero, vendedor").in("id", l),
      ),
      emLotes(
        base.map((o) => txt(o["liberacao_id"])),
        (l) => db.from("liberacoes").select("id, numero, vendedor").in("id", l),
      ),
      emLotes(
        base.map((o) => txt(o["cadastro_id"])),
        (l) => db.from("cadastros").select("id, nome").in("id", l),
      ),
      emLotes(ids, (l) =>
        db
          .from("programacao_servicos")
          .select("id, ordem_id, data, status, equipe_id")
          .in("ordem_id", l),
      ),
    ]);
    const [colaboradores, equipes, fotos] = await Promise.all([
      emLotes(
        equipe.map((e) => txt(e["colaborador_id"])),
        (l) => db.from("producao_colaboradores").select("id, nome").in("id", l),
      ),
      emLotes(
        servicos.map((s) => txt(s["equipe_id"])),
        (l) => db.from("producao_equipes").select("id, nome").in("id", l),
      ),
      emLotes(
        servicos.map((s) => txt(s["id"])),
        (l) =>
          db
            .from("anexos")
            .select("id, entidade_id, nome, url")
            .eq("entidade", "programacao")
            .in("entidade_id", l)
            .order("created_at"),
      ),
    ]);

    const nome = (lista: Row[]) => new Map(lista.map((r) => [txt(r["id"]), txt(r["nome"])]));
    const colNome = nome(colaboradores);
    const eqNome = nome(equipes);
    const cadNome = nome(cads);
    const vendaPor = new Map(vendas.map((v) => [txt(v["id"]), v]));
    const libPor = new Map(libs.map((v) => [txt(v["id"]), v]));
    const servicoDaOrdem = new Map(servicos.map((s) => [txt(s["id"]), txt(s["ordem_id"])]));
    const agrupar = <T>(lista: Row[], chave: (r: Row) => string, valor: (r: Row) => T) => {
      const m = new Map<string, T[]>();
      for (const r of lista) m.set(chave(r), [...(m.get(chave(r)) ?? []), valor(r)]);
      return m;
    };
    const etapasPor = agrupar(
      etapas,
      (e) => txt(e["ordem_id"]),
      (e) => ({
        ordem: num(e["ordem"]),
        nome: txt(e["nome"]),
        concluido: e["concluido"] === true,
      }),
    );
    const equipePor = agrupar(
      equipe,
      (e) => txt(e["ordem_id"]),
      (e) => colNome.get(txt(e["colaborador_id"])) ?? "",
    );
    const progPor = agrupar(
      servicos,
      (s) => txt(s["ordem_id"]),
      (s) => ({
        data: txt(s["data"]),
        status: txt(s["status"]),
        equipe: eqNome.get(txt(s["equipe_id"])) ?? "",
      }),
    );
    const fotosPor = agrupar(
      fotos,
      (f) => servicoDaOrdem.get(txt(f["entidade_id"])) ?? "",
      (f) => ({ id: txt(f["id"]), nome: txt(f["nome"]), url: txt(f["url"]) }),
    );
    const hoje = hojeISO();

    return base.map((o) => {
      const id = txt(o["id"]);
      const venda = vendaPor.get(txt(o["venda_id"]));
      const lib = libPor.get(txt(o["liberacao_id"]));
      const lista = etapasPor.get(id) ?? [];
      return {
        id,
        numero: num(o["numero"]),
        status: txt(o["status"]),
        descricao: txt(o["descricao"]),
        cliente: cadNome.get(txt(o["cadastro_id"])) ?? "",
        vendedor: txt(venda?.["vendedor"]) || txt(lib?.["vendedor"]),
        pedidoNumero: venda ? num(venda["numero"]) : null,
        liberacaoNumero: lib ? num(lib["numero"]) : null,
        motivoSemPedido: txt(o["motivo_sem_pedido"]),
        dataPrevista: txtOuNull(o["data_prevista"]),
        etapaAtual: etapaAtualDaOrdem(lista),
        etapasConcluidas: lista.filter((e) => e.concluido).length,
        totalEtapas: lista.length,
        equipe: (equipePor.get(id) ?? []).filter(Boolean),
        programacao: programacaoDaOrdem(progPor.get(id) ?? [], hoje),
        fotos: fotosPor.get(id) ?? [],
      };
    });
  },
};
