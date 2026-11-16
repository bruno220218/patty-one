/** Open tasks that matched the "Tarefa em aberto" filter. */
export function OpenTaskChips({ titles }: { titles: string[] }) {
  if (titles.length === 0) return null;
  const shown = titles.slice(0, 3);
  return (
    <div className="relative z-10 mt-2 flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">Falta:</span>
      {shown.map((t, i) => (
        <span
          key={`${t}-${i}`}
          className="max-w-full truncate rounded-full bg-status-progress px-2 py-0.5 text-xs font-medium text-status-progress-foreground"
        >
          {t}
        </span>
      ))}
      {titles.length > shown.length && (
        <span className="text-xs text-muted-foreground">+{titles.length - shown.length}</span>
      )}
    </div>
  );
}
