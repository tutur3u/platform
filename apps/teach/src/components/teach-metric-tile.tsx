import type { LucideIcon } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';

export function TeachMetricTile({
  accentClassName,
  icon: Icon,
  label,
  value,
}: {
  accentClassName: string;
  icon: LucideIcon;
  label: string;
  value: number;
}) {
  return (
    <article className="border-2 border-foreground/70 bg-card p-4 shadow-[5px_5px_0_var(--foreground)]">
      <span
        className={cn(
          'mb-3 flex h-10 w-10 items-center justify-center border-2 border-border shadow-[2px_2px_0_var(--border)]',
          accentClassName
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <p className="font-black text-3xl tabular-nums">{value}</p>
      <p className="text-muted-foreground text-sm">{label}</p>
    </article>
  );
}
