import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4 sm:mb-8">
      {/* Largura mínima no texto: com muitas ações, os botões descem para a linha de baixo em vez de espremer o título. */}
      <div className="min-w-[min(100%,20rem)] flex-1">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="max-w-full">{action}</div>}
    </div>
  );
}
