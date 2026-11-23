import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Loader2, Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { completarPalavra, filtrarSugestoes, type OpcaoSugestao } from "@/lib/data";
import { cn } from "@/lib/utils";

/**
 * Text field that suggests while typing: the rest of the word appears in grey (Tab or → accepts),
 * and a list shows every option containing the words typed. Optional "Cadastrar" at the end.
 * `buscar` loads options from the database instead of `opcoes`.
 */
export function CampoSugestao<T extends OpcaoSugestao>({
  valor,
  onDigitar,
  onEscolher,
  opcoes = [],
  buscar,
  onCadastrar,
  rotuloCadastrar = "Cadastrar",
  placeholder,
  ariaLabel,
  disabled = false,
  icone = false,
}: {
  valor: string;
  onDigitar: (texto: string) => void;
  onEscolher: (opcao: T) => void;
  opcoes?: T[];
  /** Database search (at least 2 letters). */
  buscar?: (termo: string) => Promise<T[]>;
  /** Shows "Cadastrar “texto”" when nothing matches exactly. */
  onCadastrar?: (texto: string) => void | Promise<void>;
  rotuloCadastrar?: string;
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
  icone?: boolean;
}) {
  const id = useId();
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const [remotas, setRemotas] = useState<T[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [cadastrando, setCadastrando] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!buscar || !aberto) return;
    const t = valor.trim();
    if (t.length < 2) {
      setRemotas([]);
      return;
    }
    setBuscando(true);
    const h = setTimeout(() => {
      buscar(t)
        .then(setRemotas)
        .catch(() => setRemotas([]))
        .finally(() => setBuscando(false));
    }, 250);
    return () => clearTimeout(h);
  }, [valor, buscar, aberto]);

  useEffect(() => {
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, []);

  const lista = useMemo(
    () => (buscar ? filtrarSugestoes(remotas, valor, 10) : filtrarSugestoes(opcoes, valor, 10)),
    [buscar, remotas, opcoes, valor],
  );
  const exato = lista.some(
    (o) => o.rotulo.toLocaleLowerCase("pt-BR") === valor.trim().toLocaleLowerCase("pt-BR"),
  );
  const mostrarCadastrar = Boolean(onCadastrar && valor.trim() && !exato && !buscando);
  const resto = aberto ? completarPalavra(valor, lista[0]?.rotulo) : "";
  const total = lista.length + (mostrarCadastrar ? 1 : 0);

  function escolher(o: T) {
    onEscolher(o);
    setAberto(false);
  }
  async function cadastrar() {
    if (!onCadastrar) return;
    setCadastrando(true);
    try {
      await onCadastrar(valor.trim());
      setAberto(false);
    } finally {
      setCadastrando(false);
    }
  }

  function teclado(e: React.KeyboardEvent<HTMLInputElement>) {
    if ((e.key === "Tab" || e.key === "ArrowRight") && resto && lista[0]) {
      if (e.key === "ArrowRight" && e.currentTarget.selectionStart !== valor.length) return;
      e.preventDefault();
      escolher(lista[0]);
      return;
    }
    if (!aberto && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setAberto(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAtivo((a) => (total ? (a + 1) % total : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAtivo((a) => (total ? (a - 1 + total) % total : 0));
    } else if (e.key === "Enter" && aberto && total) {
      e.preventDefault();
      if (ativo < lista.length) escolher(lista[ativo]!);
      else void cadastrar();
    } else if (e.key === "Escape") {
      setAberto(false);
    }
  }

  return (
    <div ref={caixa} className="relative">
      {icone && (
        <Search className="pointer-events-none absolute top-3 left-3 z-10 size-4 text-muted-foreground" />
      )}
      {resto && (
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 flex items-center overflow-hidden px-3 text-sm whitespace-pre",
            icone && "pl-9",
          )}
        >
          <span className="invisible">{valor}</span>
          <span className="text-muted-foreground/60">{resto}</span>
        </div>
      )}
      <Input
        role="combobox"
        aria-expanded={aberto}
        aria-controls={`${id}-lista`}
        aria-autocomplete="both"
        aria-label={ariaLabel}
        autoComplete="off"
        className={cn("bg-transparent", icone && "pl-9")}
        value={valor}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={() => setAberto(true)}
        onChange={(e) => {
          onDigitar(e.target.value);
          setAtivo(0);
          setAberto(true);
        }}
        onKeyDown={teclado}
      />
      {aberto && (total > 0 || buscando) && (
        <ul
          id={`${id}-lista`}
          role="listbox"
          className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-lg"
        >
          {lista.map((o, i) => (
            <li
              key={o.id}
              role="option"
              aria-selected={i === ativo}
              onMouseDown={(e) => {
                e.preventDefault();
                escolher(o);
              }}
              onMouseEnter={() => setAtivo(i)}
              className={cn(
                "cursor-pointer rounded px-2 py-1.5 text-sm",
                i === ativo ? "bg-accent text-accent-foreground" : "",
              )}
            >
              <span className="block truncate">{o.rotulo}</span>
              {o.detalhe && (
                <span className="block truncate text-xs text-muted-foreground">{o.detalhe}</span>
              )}
            </li>
          ))}
          {buscando && (
            <li className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Buscando…
            </li>
          )}
          {mostrarCadastrar && (
            <li
              role="option"
              aria-selected={ativo === lista.length}
              onMouseDown={(e) => {
                e.preventDefault();
                void cadastrar();
              }}
              onMouseEnter={() => setAtivo(lista.length)}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded border-t px-2 py-1.5 text-sm text-primary",
                ativo === lista.length ? "bg-accent" : "",
              )}
            >
              {cadastrando ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Plus className="size-3.5" />
              )}
              {rotuloCadastrar} “{valor.trim()}”
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
