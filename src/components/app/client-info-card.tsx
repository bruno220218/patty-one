import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ProjectClientInfo } from "@/lib/data";

const laminationLabel = (v: boolean | null) => (v === null ? "—" : v ? "Sim" : "Não");

export function ClientInfoCard({ info, onEdit }: { info: ProjectClientInfo; onEdit: () => void }) {
  const rows: { label: string; value: string }[] = [
    { label: "Tipo de serviço", value: info.serviceType || "—" },
    { label: "Cor do LED", value: info.ledColor || "—" },
    { label: "Cores para pintura", value: info.paintColors || "—" },
    { label: "Tipo de adesivação", value: info.adhesiveType || "—" },
    { label: "Haverá laminação?", value: laminationLabel(info.lamination) },
  ];

  return (
    <section className="surface-card mt-6 p-5" aria-labelledby="client-info-title">
      <div className="flex items-center justify-between gap-2">
        <h2 id="client-info-title" className="text-base font-semibold">
          Informações do cliente
        </h2>
        <Button variant="ghost" size="sm" onClick={onEdit}>
          <Pencil />
          Editar
        </Button>
      </div>
      <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label} className="min-w-0">
            <dt className="text-xs text-muted-foreground">{row.label}</dt>
            <dd className="break-words text-sm font-medium">{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
