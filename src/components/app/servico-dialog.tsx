import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarRange, ExternalLink, ImagePlus, Loader2, MessageCircle, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AnexosPanel } from "@/components/app/anexos-panel";
import { CampoSugestao } from "@/components/app/campo-sugestao";
import { ConfirmacaoConflitos } from "@/components/app/operacao-ui";
import { useDataAction, usePontosMidia, useSetores } from "@/hooks/use-data";
import { enviarParaDrive } from "@/lib/drive-upload";
import {
  abreviarNome,
  alocacaoDaLinha,
  anexosRepository,
  cadastroRepository,
  CADASTRO_FILTROS_VAZIOS,
  dataCurtaBR,
  datasDoPeriodo,
  detectarConflitos,
  enderecoDoPonto,
  IMAGEM_ACCEPT,
  imagemPermitida,
  linhasDoPeriodo,
  operacaoRepository,
  nomesDosSetores,
  STATUS_PROGRAMACAO,
  validarLinha,
  validarPeriodo,
  type LinhaProgramacao,
  type OpcaoSugestao,
  type ProgramacaoDia,
  type SetorProgramacao,
  type StatusProgramacao,
} from "@/lib/data";
import { cn } from "@/lib/utils";

const sel =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-60";

function Campo({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5 text-sm font-medium", className)}>
      <span className="block">{label}</span>
      {children}
    </div>
  );
}

function Secao({
  titulo,
  acao,
  children,
}: {
  titulo: string;
  acao?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-xl border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {titulo}
        </h3>
        {acao}
      </div>
      {children}
    </section>
  );
}

function LinkCadastro({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <a
      href={to}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-xs font-normal text-primary hover:underline"
    >
      {children}
      <ExternalLink className="size-3" />
    </a>
  );
}

type Opcao = OpcaoSugestao;

/** One service at a time, in sections, with suggestions, "vários dias" and images. */
export function ServicoDialog({
  dados,
  inicial,
  onFechar,
}: {
  dados: ProgramacaoDia;
  inicial: LinhaProgramacao;
  onFechar: () => void;
}) {
  const run = useDataAction();
  const { data: setoresDb } = useSetores();
  const setores = nomesDosSetores(setoresDb);
  const editando = Boolean(inicial.id);
  const [l, setL] = useState<LinhaProgramacao>(inicial);
  const [variosDias, setVariosDias] = useState(false);
  const [ate, setAte] = useState("");
  const [sabado, setSabado] = useState(false);
  const [domingo, setDomingo] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [etapa, setEtapa] = useState("");
  const [confirmacao, setConfirmacao] = useState<string[] | null>(null);
  const [imagens, setImagens] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const { colaboradores, veiculos, equipes, produtos, servicos } = dados.recursos;
  const { data: pontos = [] } = usePontosMidia();

  const nomeColab = (id: string) => colaboradores.find((c) => c.id === id)?.nome ?? "";
  const rotuloVeic = (id: string) => veiculos.find((v) => v.id === id)?.rotulo ?? "";
  const [liderTexto, setLiderTexto] = useState(() => nomeColab(inicial.liderId));
  const [ajudanteTexto, setAjudanteTexto] = useState("");
  const [veiculoTexto, setVeiculoTexto] = useState(() => rotuloVeic(inicial.veiculoId));
  const [placaTexto, setPlacaTexto] = useState("");

  // The point list loads after the dialog opens: show the chosen point's code once it arrives.
  useEffect(() => {
    if (!l.pontoId || placaTexto) return;
    const p = pontos.find((x) => x.id === l.pontoId);
    if (p) setPlacaTexto(`${p.codigo} — ${p.nome}`);
  }, [pontos, l.pontoId, placaTexto]);

  const atualizar = (p: Partial<LinhaProgramacao>) =>
    setL((a) => ({ ...a, ...p, conflitoConfirmado: false }));

  // ----- Opções das sugestões -----
  const opServicos = useMemo<Opcao[]>(
    () =>
      servicos
        .filter((s) => s.ativo)
        .map((s) => ({ id: s.id, rotulo: s.nome, detalhe: s.produto || undefined })),
    [servicos],
  );
  const opProdutos = useMemo<Opcao[]>(
    () => produtos.filter((p) => p.ativo).map((p) => ({ id: p.id, rotulo: p.nome })),
    [produtos],
  );
  const opColabs = useMemo<Opcao[]>(
    () =>
      colaboradores
        .filter((c) => c.ativo)
        .map((c) => ({ id: c.id, rotulo: c.nome, detalhe: c.empresa || undefined })),
    [colaboradores],
  );
  const opVeiculos = useMemo<Opcao[]>(
    () =>
      veiculos
        .filter((v) => v.ativo)
        .map((v) => ({
          id: v.id,
          rotulo: v.rotulo,
          detalhe: [v.modelo, v.marca].filter(Boolean).join(" ") || undefined,
          busca: `${v.placa} ${v.modelo} ${v.marca}`,
        })),
    [veiculos],
  );
  const opPontos = useMemo<Opcao[]>(
    () =>
      pontos.map((p) => ({
        id: p.id,
        rotulo: `${p.codigo} — ${p.nome}`,
        detalhe: enderecoDoPonto(p) || undefined,
        busca: `${p.endereco} ${p.bairro} ${p.cidade} ${p.referencia}`,
      })),
    [pontos],
  );
  const buscarClientes = useMemo(
    () => async (termo: string) =>
      (await cadastroRepository.list({ ...CADASTRO_FILTROS_VAZIOS, busca: termo }, 1)).linhas
        .slice(0, 10)
        .map((c) => ({
          id: c.id,
          rotulo: c.nome,
          detalhe: [c.cpfCnpj, [c.cidade, c.estado].filter(Boolean).join("/")]
            .filter(Boolean)
            .join(" · "),
          busca: c.cpfCnpj,
        })),
    [],
  );

  function escolherEquipe(equipeId: string) {
    const eq = equipes.find((e) => e.id === equipeId);
    if (!eq) return atualizar({ equipeId: "" });
    const membros = eq.colaboradores.map((m) => m.id);
    const veiculoId = eq.veiculos[0]?.id ?? l.veiculoId;
    setLiderTexto(membros[0] ? nomeColab(membros[0]) : "");
    setVeiculoTexto(rotuloVeic(veiculoId));
    atualizar({
      equipeId,
      liderId: membros[0] ?? "",
      ajudantes: membros.slice(1),
      veiculoId,
      setor: eq.setor || l.setor,
    });
  }

  // ----- Cadastros rápidos (entram na lista de sugestões das próximas vezes) -----
  async function cadastrarServico(nome: string) {
    const ok = await run(
      () =>
        operacaoRepository
          .salvarServico({ nome, produto: l.produto, ativo: true })
          .then(() => true),
      `Serviço “${nome}” cadastrado.`,
    );
    if (ok) atualizar({ servico: nome });
  }
  async function cadastrarProduto(nome: string) {
    const ok = await run(
      () => operacaoRepository.salvarProduto({ nome, ativo: true }).then(() => true),
      `Produto “${nome}” cadastrado.`,
    );
    if (ok) atualizar({ produto: nome });
  }
  async function cadastrarLider(nome: string) {
    const id = await run(() => operacaoRepository.criarColaborador(nome), `“${nome}” cadastrado.`);
    if (id) {
      setLiderTexto(nome);
      atualizar({ liderId: id, ajudantes: l.ajudantes.filter((a) => a !== id) });
    }
  }
  async function cadastrarAjudante(nome: string) {
    const id = await run(() => operacaoRepository.criarColaborador(nome), `“${nome}” cadastrado.`);
    if (id) {
      setAjudanteTexto("");
      atualizar({ ajudantes: [...l.ajudantes, id] });
    }
  }
  async function cadastrarVeiculo(placa: string) {
    const id = await run(
      () => operacaoRepository.criarVeiculo(placa, ""),
      `Veículo ${placa.toUpperCase()} cadastrado.`,
    );
    if (id) {
      setVeiculoTexto(placa.toUpperCase());
      atualizar({ veiculoId: id });
    }
  }

  const datas = useMemo(
    () => (variosDias ? datasDoPeriodo(l.data, ate, { sabado, domingo }) : [l.data]),
    [variosDias, l.data, ate, sabado, domingo],
  );

  /** Sends the chosen images to Drive once and links them to every day of the service. */
  async function enviarImagens(ids: string[]) {
    let falhas = 0;
    for (const [i, file] of imagens.entries()) {
      setEtapa(`Enviando imagem ${i + 1} de ${imagens.length}…`);
      try {
        const drive = await enviarParaDrive(file, "programacao", ids[0]!);
        for (const id of ids) {
          await anexosRepository.add({
            entidade: "programacao",
            entidadeId: id,
            url: drive.url,
            nome: file.name,
            tipo: "foto",
            driveId: drive.id,
            tamanho: file.size,
          });
        }
      } catch (e) {
        falhas++;
        toast.error(
          `“${file.name}”: ${e instanceof Error ? e.message : "não foi possível enviar."}`,
        );
      }
    }
    if (falhas < imagens.length) toast.success("Imagens enviadas para o Drive.");
  }

  async function salvar(confirmado: boolean) {
    const linhas = linhasDoPeriodo({ ...l, conflitoConfirmado: confirmado }, datas);
    setOcupado(true);
    setEtapa("Salvando…");
    const antes =
      !editando && imagens.length
        ? new Set(await operacaoRepository.idsDosServicos(datas, l.servico, l.setor))
        : null;
    const n = await run(() => operacaoRepository.salvarProgramacao(linhas, []));
    if (n !== undefined && antes) {
      const novos = (await operacaoRepository.idsDosServicos(datas, l.servico, l.setor)).filter(
        (id) => !antes.has(id),
      );
      if (novos.length) await enviarImagens(novos);
      else toast.error("O serviço foi salvo, mas não achei o registro para anexar as imagens.");
      await run(() => Promise.resolve(true)); // refresh the lists with the new images
    }
    setOcupado(false);
    setEtapa("");
    if (n !== undefined) {
      toast.success(
        n > 1
          ? `Serviço programado em ${n} dias.`
          : editando
            ? "Serviço atualizado."
            : "Serviço programado.",
      );
      onFechar();
    }
  }

  async function enviar() {
    const erro =
      validarLinha(l) ?? (variosDias ? validarPeriodo(l.data, ate, { sabado, domingo }) : null);
    if (erro) return void toast.error(erro);
    setOcupado(true);
    setEtapa("Verificando equipe e veículo…");
    try {
      const linhas = linhasDoPeriodo(l, datas);
      const externas = await operacaoRepository.alocacoesExistentes(datas, l.id ? [l.id] : []);
      const minhas = linhas.map(alocacaoDaLinha);
      const ids = new Set(minhas.map((a) => a.id));
      const mensagens = new Set<string>();
      for (const c of detectarConflitos([...minhas, ...externas])) {
        const [a, b] = c.alocacoes;
        if (ids.has(a) && ids.has(b)) continue; // the same service on its own days
        const outro = [...minhas, ...externas].find((x) => x.id === (ids.has(a) ? b : a));
        const quando = dataCurtaBR(outro?.dataInicio ?? l.data);
        mensagens.add(
          c.recurso === "colaborador"
            ? `${abreviarNome(nomeColab(c.recursoId) || "Colaborador")} também está em ${outro?.descricao ?? "outro serviço"} (${quando}).`
            : `O veículo ${rotuloVeic(c.recursoId)} também está em ${outro?.descricao ?? "outro serviço"} (${quando}).`,
        );
      }
      setOcupado(false);
      setEtapa("");
      if (mensagens.size) setConfirmacao([...mensagens]);
      else await salvar(false);
    } catch (e) {
      setOcupado(false);
      setEtapa("");
      toast.error(e instanceof Error ? e.message : "Não foi possível verificar os recursos.");
    }
  }

  function escolherArquivos(files: FileList | null) {
    if (!files) return;
    const ok = Array.from(files).filter((f) => {
      if (imagemPermitida(f.name, f.type)) return true;
      toast.error(`“${f.name}”: envie imagens (JPG, PNG, WEBP ou GIF).`);
      return false;
    });
    setImagens((a) => [...a, ...ok]);
    if (fileRef.current) fileRef.current.value = "";
  }

  const ajudantes = l.ajudantes.map((id) => ({ id, nome: nomeColab(id) }));
  const opAjudantes = opColabs.filter((o) => o.id !== l.liderId && !l.ajudantes.includes(o.id));

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && !ocupado && onFechar()}>
      <DialogContent
        className="max-h-[92vh] max-w-2xl overflow-y-auto"
        onEscapeKeyDown={(e) => {
          // Esc with a suggestion list open closes only the list, not the form.
          const foco = document.activeElement;
          if (
            foco?.getAttribute("role") === "combobox" &&
            foco.getAttribute("aria-expanded") === "true"
          ) {
            e.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{editando ? "Editar serviço" : "Novo serviço"}</DialogTitle>
          <DialogDescription>
            Comece a digitar e escolha nas sugestões. Só setor, serviço e data são obrigatórios.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Secao
            titulo="1. O que fazer"
            acao={
              <LinkCadastro to="/planejamento/catalogos">Editar serviços e produtos</LinkCadastro>
            }
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo label="Setor *">
                <select
                  aria-label="Setor"
                  className={sel}
                  value={l.setor}
                  onChange={(e) => atualizar({ setor: e.target.value as SetorProgramacao })}
                >
                  <option value="">Selecione</option>
                  {setores.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </Campo>
              <Campo label="Cliente">
                <CampoSugestao
                  ariaLabel="Cliente"
                  icone
                  valor={l.cliente}
                  placeholder="Digite o nome ou CNPJ"
                  buscar={buscarClientes}
                  onDigitar={(t) => atualizar({ cliente: t, cadastroId: "" })}
                  onEscolher={(o) => atualizar({ cliente: o.rotulo, cadastroId: o.id })}
                />
                {l.cliente && !l.cadastroId && (
                  <span className="block text-xs font-normal text-muted-foreground">
                    Não está nos cadastros: fica só o nome digitado.
                  </span>
                )}
              </Campo>
              <Campo label="Serviço *">
                <CampoSugestao
                  ariaLabel="Serviço"
                  valor={l.servico}
                  placeholder="Ex.: Instalação de lona"
                  opcoes={opServicos}
                  onDigitar={(t) => atualizar({ servico: t })}
                  onEscolher={(o) =>
                    atualizar({ servico: o.rotulo, produto: l.produto || o.detalhe || "" })
                  }
                  onCadastrar={cadastrarServico}
                  rotuloCadastrar="Cadastrar serviço"
                />
              </Campo>
              <Campo label="Produto">
                <CampoSugestao
                  ariaLabel="Produto"
                  valor={l.produto}
                  placeholder="Ex.: Lona"
                  opcoes={opProdutos}
                  onDigitar={(t) => atualizar({ produto: t })}
                  onEscolher={(o) => atualizar({ produto: o.rotulo })}
                  onCadastrar={cadastrarProduto}
                  rotuloCadastrar="Cadastrar produto"
                />
              </Campo>
              <Campo label="Quantidade">
                <Input
                  aria-label="Quantidade"
                  inputMode="decimal"
                  placeholder="1"
                  value={l.quantidade}
                  onChange={(e) => atualizar({ quantidade: e.target.value })}
                />
              </Campo>
              <Campo label="Ordem de produção (opcional)">
                <select
                  aria-label="Ordem de produção"
                  className={sel}
                  value={l.ordemId}
                  onChange={(e) => atualizar({ ordemId: e.target.value })}
                >
                  <option value="">Sem vínculo</option>
                  {dados.ordensAbertas.map((o) => (
                    <option key={o.id} value={o.id}>
                      nº {o.numero} {o.descricao ? `— ${o.descricao.slice(0, 40)}` : ""}
                    </option>
                  ))}
                </select>
              </Campo>
            </div>
            <Campo label="Detalhamento">
              <Textarea
                aria-label="Detalhamento"
                rows={2}
                value={l.detalhamento}
                onChange={(e) => atualizar({ detalhamento: e.target.value })}
                placeholder="O que exatamente a equipe vai fazer"
              />
            </Campo>
          </Secao>

          <Secao titulo="2. Onde">
            <Campo label="Placa / ponto de mídia">
              <CampoSugestao
                ariaLabel="Placa ou ponto de mídia"
                icone
                valor={placaTexto}
                placeholder="Digite o número da placa, nome ou rua"
                opcoes={opPontos}
                onDigitar={(t) => {
                  setPlacaTexto(t);
                  if (!t.trim()) atualizar({ pontoId: "" });
                }}
                onEscolher={(o) => {
                  setPlacaTexto(o.rotulo);
                  atualizar({ pontoId: o.id, local: o.detalhe ?? l.local });
                }}
              />
              <span className="block text-xs font-normal text-muted-foreground">
                Ao escolher a placa, o endereço é preenchido sozinho.
              </span>
            </Campo>
            <Campo label="Endereço / local">
              <Input
                aria-label="Endereço ou local"
                value={l.local}
                onChange={(e) => atualizar({ local: e.target.value })}
                placeholder="Rua, número, bairro, cidade"
              />
            </Campo>
          </Secao>

          <Secao titulo="3. Quando">
            <div className="grid gap-3 sm:grid-cols-3">
              <Campo label={variosDias ? "De *" : "Data *"}>
                <Input
                  aria-label="Data"
                  type="date"
                  value={l.data}
                  onChange={(e) => atualizar({ data: e.target.value })}
                />
              </Campo>
              <Campo label="Início">
                <Input
                  aria-label="Hora de início"
                  type="time"
                  value={l.horaInicio}
                  onChange={(e) => atualizar({ horaInicio: e.target.value })}
                />
              </Campo>
              <Campo label="Fim">
                <Input
                  aria-label="Hora de fim"
                  type="time"
                  value={l.horaFim}
                  onChange={(e) => atualizar({ horaFim: e.target.value })}
                />
              </Campo>
            </div>
            {!editando && (
              <div className="space-y-3 rounded-lg bg-muted/50 p-3">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Checkbox
                    checked={variosDias}
                    onCheckedChange={(v) => setVariosDias(v === true)}
                  />
                  <CalendarRange className="size-4" />
                  Serviço de vários dias
                </label>
                {variosDias && (
                  <>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Campo label="Até *">
                        <Input
                          aria-label="Até"
                          type="date"
                          min={l.data}
                          value={ate}
                          onChange={(e) => setAte(e.target.value)}
                        />
                      </Campo>
                      <label className="flex items-center gap-2 self-end pb-2 text-sm">
                        <Checkbox checked={sabado} onCheckedChange={(v) => setSabado(v === true)} />
                        Incluir sábados
                      </label>
                      <label className="flex items-center gap-2 self-end pb-2 text-sm">
                        <Checkbox
                          checked={domingo}
                          onCheckedChange={(v) => setDomingo(v === true)}
                        />
                        Incluir domingos
                      </label>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {ate
                        ? `Vai aparecer em ${datas.length} dia(s): ${datas
                            .slice(0, 6)
                            .map((d) => dataCurtaBR(d).slice(0, 5))
                            .join(
                              ", ",
                            )}${datas.length > 6 ? "…" : ""}. Cada dia recebe a sua baixa.`
                        : "Escolha até quando. Cada dia vira um serviço com a sua própria baixa."}
                    </p>
                  </>
                )}
              </div>
            )}
          </Secao>

          <Secao
            titulo="4. Quem vai"
            acao={
              <span className="flex gap-3">
                <LinkCadastro to="/planejamento/catalogos">Editar funcionários</LinkCadastro>
                <LinkCadastro to="/planejamento/veiculos">Editar veículos</LinkCadastro>
              </span>
            }
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo label="Equipe (preenche líder, ajudantes e veículo)">
                <select
                  aria-label="Equipe"
                  className={sel}
                  value={l.equipeId}
                  onChange={(e) => escolherEquipe(e.target.value)}
                >
                  <option value="">—</option>
                  {equipes
                    .filter((e) => e.ativo || e.id === l.equipeId)
                    .map((eq) => (
                      <option key={eq.id} value={eq.id}>
                        {eq.nome}
                      </option>
                    ))}
                </select>
              </Campo>
              <Campo label="Líder">
                <CampoSugestao
                  ariaLabel="Líder"
                  valor={liderTexto}
                  placeholder="Digite o nome"
                  opcoes={opColabs}
                  onDigitar={(t) => {
                    setLiderTexto(t);
                    if (!t.trim()) atualizar({ liderId: "" });
                  }}
                  onEscolher={(o) => {
                    setLiderTexto(o.rotulo);
                    atualizar({
                      liderId: o.id,
                      ajudantes: l.ajudantes.filter((a) => a !== o.id),
                    });
                  }}
                  onCadastrar={cadastrarLider}
                  rotuloCadastrar="Cadastrar funcionário"
                />
              </Campo>
              <Campo label="Ajudantes" className="sm:col-span-2">
                {ajudantes.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {ajudantes.map((a) => (
                      <span
                        key={a.id}
                        className="inline-flex items-center gap-1 rounded-full border bg-muted py-0.5 pr-1 pl-2.5 text-xs font-normal"
                      >
                        {a.nome || "Funcionário"}
                        <button
                          type="button"
                          aria-label={`Tirar ${a.nome}`}
                          className="rounded-full p-0.5 hover:bg-background"
                          onClick={() =>
                            atualizar({ ajudantes: l.ajudantes.filter((x) => x !== a.id) })
                          }
                        >
                          <X className="size-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <CampoSugestao
                  ariaLabel="Adicionar ajudante"
                  valor={ajudanteTexto}
                  placeholder="Digite para adicionar um ajudante"
                  opcoes={opAjudantes}
                  onDigitar={setAjudanteTexto}
                  onEscolher={(o) => {
                    setAjudanteTexto("");
                    atualizar({ ajudantes: [...l.ajudantes, o.id] });
                  }}
                  onCadastrar={cadastrarAjudante}
                  rotuloCadastrar="Cadastrar funcionário"
                />
              </Campo>
              <Campo label="Veículo">
                <CampoSugestao
                  ariaLabel="Veículo"
                  valor={veiculoTexto}
                  placeholder="Digite a placa ou apelido"
                  opcoes={opVeiculos}
                  onDigitar={(t) => {
                    setVeiculoTexto(t);
                    if (!t.trim()) atualizar({ veiculoId: "" });
                  }}
                  onEscolher={(o) => {
                    setVeiculoTexto(o.rotulo);
                    atualizar({ veiculoId: o.id });
                  }}
                  onCadastrar={cadastrarVeiculo}
                  rotuloCadastrar="Cadastrar veículo com a placa"
                />
              </Campo>
            </div>
          </Secao>

          <Secao titulo="5. Imagens">
            {editando && l.id ? (
              <AnexosPanel
                entidade="programacao"
                entidadeId={l.id}
                titulo="Imagens do serviço"
                accept={IMAGEM_ACCEPT}
                permitido={imagemPermitida}
                formatos="imagens (JPG, PNG, WEBP ou GIF)"
                rotuloBotao="Adicionar imagens"
                className="border-0 p-0 shadow-none"
              />
            ) : (
              <div className="space-y-2">
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  accept={IMAGEM_ACCEPT}
                  className="hidden"
                  onChange={(e) => escolherArquivos(e.target.files)}
                />
                <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
                  <ImagePlus />
                  Escolher imagens
                </Button>
                {imagens.length > 0 && (
                  <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {imagens.map((f, i) => (
                      <li key={`${f.name}-${i}`} className="relative">
                        <Miniatura file={f} />
                        <button
                          type="button"
                          aria-label={`Tirar ${f.name}`}
                          className="absolute top-1 right-1 rounded-full bg-background/90 p-0.5 shadow"
                          onClick={() => setImagens((a) => a.filter((_, k) => k !== i))}
                        >
                          <X className="size-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MessageCircle className="size-3.5" />
              As imagens vão para o Google Drive e o link de cada uma entra sozinho na mensagem do
              WhatsApp.
              {variosDias && datas.length > 1 ? " Elas aparecem em todos os dias do serviço." : ""}
            </p>
          </Secao>

          <Secao titulo="6. Situação">
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo label="Status">
                <select
                  aria-label="Status"
                  className={sel}
                  value={l.status}
                  onChange={(e) => atualizar({ status: e.target.value as StatusProgramacao })}
                >
                  {STATUS_PROGRAMACAO.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </Campo>
              <Campo label="Observação / motivo">
                <Input
                  aria-label="Observação"
                  value={l.observacao}
                  onChange={(e) => atualizar({ observacao: e.target.value })}
                />
              </Campo>
            </div>
          </Secao>
        </div>

        <DialogFooter className="items-center gap-2">
          {etapa && <span className="mr-auto text-xs text-muted-foreground">{etapa}</span>}
          <Button variant="outline" onClick={onFechar} disabled={ocupado}>
            {editando ? "Fechar" : "Cancelar"}
          </Button>
          <Button onClick={() => void enviar()} disabled={ocupado}>
            {ocupado && <Loader2 className="animate-spin" />}
            {editando
              ? "Salvar alterações"
              : datas.length > 1
                ? `Programar ${datas.length} dias`
                : "Programar"}
          </Button>
        </DialogFooter>

        {confirmacao && (
          <ConfirmacaoConflitos
            mensagens={confirmacao}
            salvando={ocupado}
            onConfirmar={() => {
              setConfirmacao(null);
              void salvar(true);
            }}
            onCancelar={() => setConfirmacao(null)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Miniatura({ file }: { file: File }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return url ? (
    <img
      src={url}
      alt={file.name}
      className="aspect-square w-full rounded-md border object-cover"
    />
  ) : (
    <div className="aspect-square w-full rounded-md border bg-muted" />
  );
}
