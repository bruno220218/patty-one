import { useState } from "react";
import { CheckCircle2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/app/form-field";
import {
  LOCAL_MEDIDA,
  onlyDigits,
  PISOS,
  SUPERFICIES,
  VOLTAGENS,
  type SimNao,
  type Vistoria,
} from "@/lib/data";
import { cn } from "@/lib/utils";

function Bloco({
  titulo,
  children,
  className,
}: {
  titulo: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <fieldset className={cn("rounded-lg border border-border p-4", className)}>
      <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {titulo}
      </legend>
      <div className="space-y-3">{children}</div>
    </fieldset>
  );
}

function SimNaoField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: SimNao;
  onChange: (v: SimNao) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-sm">{label}</span>
      <div className="flex gap-1" role="radiogroup" aria-label={label}>
        {(["sim", "nao"] as const).map((op) => (
          <Button
            key={op}
            type="button"
            size="sm"
            variant={value === op ? "default" : "outline"}
            className="h-8 min-w-14"
            role="radio"
            aria-checked={value === op}
            disabled={disabled}
            onClick={() => onChange(value === op ? null : op)}
          >
            {op === "sim" ? "Sim" : "Não"}
          </Button>
        ))}
      </div>
    </div>
  );
}

function Marcar({
  opcoes,
  value,
  onChange,
  disabled,
  colunas = 2,
}: {
  opcoes: string[];
  value: string[];
  onChange: (v: string[]) => void;
  disabled: boolean;
  colunas?: number;
}) {
  return (
    <div className={cn("grid gap-2", colunas === 3 ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2")}>
      {opcoes.map((op) => {
        const on = value.includes(op);
        return (
          <label key={op} className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={on}
              disabled={disabled}
              onCheckedChange={(c) => onChange(c ? [...value, op] : value.filter((x) => x !== op))}
            />
            {op}
          </label>
        );
      })}
    </div>
  );
}

function Quant({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-sm">
      {label}
      <Input
        value={value}
        onChange={(e) => onChange(onlyDigits(e.target.value))}
        inputMode="numeric"
        className="h-8 w-20 text-right"
        readOnly={disabled}
        aria-label={`${label} - quantidade`}
      />
    </label>
  );
}

/** "VISITA TÉCNICA/MEDIDAS" form, filled by montagem at the client's site. */
export function VistoriaForm({
  initial,
  readOnly,
  podeConcluir,
  temFoto,
  saving,
  onSalvar,
  onConcluir,
}: {
  initial: Vistoria;
  readOnly: boolean;
  podeConcluir: boolean;
  temFoto: boolean;
  saving: boolean;
  onSalvar: (v: Vistoria) => void | Promise<void>;
  onConcluir: (v: Vistoria) => void | Promise<void>;
}) {
  const [v, setV] = useState<Vistoria>(initial);
  const set = <K extends keyof Vistoria>(k: K, value: Vistoria[K]) =>
    setV((old) => ({ ...old, [k]: value }));
  const ro = readOnly;

  return (
    <section className="surface-card space-y-4 p-5" aria-labelledby="vistoria-titulo">
      <h2 id="vistoria-titulo" className="text-sm font-semibold">
        Visita técnica / medidas
      </h2>

      <FormField id="v-obra" label="Avaliação do andamento da obra">
        <Textarea
          id="v-obra"
          value={v.avaliacaoObra}
          onChange={(e) => set("avaliacaoObra", e.target.value)}
          rows={2}
          readOnly={ro}
        />
      </FormField>

      <div className="grid gap-4 md:grid-cols-2">
        <Bloco titulo="Local">
          <div className="space-y-1.5">
            <span className="text-sm">A medida feita foi</span>
            <Marcar
              opcoes={LOCAL_MEDIDA}
              value={v.localMedida}
              onChange={(x) => set("localMedida", x)}
              disabled={ro}
            />
          </div>
          <SimNaoField
            label="Limpeza do local de instalação"
            value={v.limpeza}
            onChange={(x) => set("limpeza", x)}
            disabled={ro}
          />
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={v.retiradaMaterialVelho}
              disabled={ro}
              onCheckedChange={(c) => set("retiradaMaterialVelho", c === true)}
            />
            Retirada de material velho
          </label>
        </Bloco>

        <Bloco titulo="Trabalho em altura">
          <SimNaoField
            label="Trabalho em altura"
            value={v.trabalhoAltura}
            onChange={(x) => set("trabalhoAltura", x)}
            disabled={ro}
          />
          <SimNaoField
            label="Cinto de segurança"
            value={v.cintoSeguranca}
            onChange={(x) => set("cintoSeguranca", x)}
            disabled={ro}
          />
          <div className="grid grid-cols-2 gap-2">
            <FormField id="v-escada" label="Escada (altura)">
              <Input
                id="v-escada"
                value={v.escadaAltura}
                onChange={(e) => set("escadaAltura", e.target.value)}
                readOnly={ro}
                placeholder="ex.: 6 m"
              />
            </FormField>
            <FormField id="v-munck" label="Munck (altura)">
              <Input
                id="v-munck"
                value={v.munckAltura}
                onChange={(e) => set("munckAltura", e.target.value)}
                readOnly={ro}
                placeholder="ex.: 12 m"
              />
            </FormField>
          </div>
        </Bloco>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Bloco titulo="Parede / superfície">
          <Marcar
            opcoes={SUPERFICIES}
            value={v.superficies}
            onChange={(x) => set("superficies", x)}
            disabled={ro}
          />
        </Bloco>
        <Bloco titulo="Andaime">
          <SimNaoField
            label="Precisa de andaime"
            value={v.andaime}
            onChange={(x) => set("andaime", x)}
            disabled={ro}
          />
          {v.andaime === "sim" && (
            <div className="space-y-2">
              <Quant
                label="Jogos"
                value={v.andaimeJogos}
                onChange={(x) => set("andaimeJogos", x)}
                disabled={ro}
              />
              <Quant
                label="Sapata"
                value={v.andaimeSapata}
                onChange={(x) => set("andaimeSapata", x)}
                disabled={ro}
              />
              <Quant
                label="Tábuas"
                value={v.andaimeTabuas}
                onChange={(x) => set("andaimeTabuas", x)}
                disabled={ro}
              />
              <Quant
                label="Rodinhas"
                value={v.andaimeRodinhas}
                onChange={(x) => set("andaimeRodinhas", x)}
                disabled={ro}
              />
            </div>
          )}
        </Bloco>
        <Bloco titulo="Tipo de piso">
          <Marcar opcoes={PISOS} value={v.piso} onChange={(x) => set("piso", x)} disabled={ro} />
        </Bloco>
      </div>

      <Bloco titulo="Parte elétrica">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <span className="text-sm">Tipo de voltagem</span>
            <Marcar
              opcoes={VOLTAGENS}
              value={v.voltagem}
              onChange={(x) => set("voltagem", x)}
              disabled={ro}
            />
          </div>
          <div className="space-y-2">
            <SimNaoField
              label="Tomada"
              value={v.tomada}
              onChange={(x) => set("tomada", x)}
              disabled={ro}
            />
            <SimNaoField
              label="Ponto de energia"
              value={v.pontoEnergia}
              onChange={(x) => set("pontoEnergia", x)}
              disabled={ro}
            />
            <SimNaoField
              label="Extensão"
              value={v.extensao}
              onChange={(x) => set("extensao", x)}
              disabled={ro}
            />
            {v.extensao === "sim" && (
              <FormField id="v-ext" label="Tamanho necessário">
                <Input
                  id="v-ext"
                  value={v.tamanhoExtensao}
                  onChange={(e) => set("tamanhoExtensao", e.target.value)}
                  readOnly={ro}
                  placeholder="ex.: 15 m"
                />
              </FormField>
            )}
          </div>
        </div>
      </Bloco>

      <FormField id="v-dif" label="Dificuldades encontradas">
        <Textarea
          id="v-dif"
          value={v.dificuldades}
          onChange={(e) => set("dificuldades", e.target.value)}
          rows={3}
          readOnly={ro}
        />
      </FormField>

      {!ro && (
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
          {podeConcluir && !temFoto && (
            <p className="text-xs text-muted-foreground sm:mr-auto">
              Para concluir, anexe as fotos dos espaços (obrigatório).
            </p>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => onSalvar(v)}
            className="h-10"
          >
            <Save />
            Salvar
          </Button>
          {podeConcluir && (
            <Button
              type="button"
              disabled={saving || !temFoto}
              onClick={() => onConcluir(v)}
              className="h-10"
            >
              <CheckCircle2 />
              Concluir visita
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
