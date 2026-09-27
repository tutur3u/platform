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
    <article className="flex min-h-32 flex-col justify-between rounded-xl border border-border bg-card p-4">
      <span
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-md',
          accentClassName
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <p className="font-semibold text-2xl tabular-nums">{value}</p>
        <p className="text-muted-foreground text-xs">{label}</p>
      </div>
    </article>
  );
}
