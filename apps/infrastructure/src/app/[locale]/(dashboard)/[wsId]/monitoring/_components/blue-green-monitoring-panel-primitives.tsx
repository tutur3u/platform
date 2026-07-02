import { Badge } from '@tuturuuu/ui/badge';
import type { ReactNode } from 'react';

export function MetricBlock({
  icon,
  label,
  meta,
  value,
}: {
  icon: ReactNode;
  label: string;
  meta?: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border/50 bg-background/80 p-3">
      <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-[0.16em]">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-2 font-medium text-base">{value}</div>
      {meta ? (
        <div className="mt-1 text-muted-foreground text-xs">{meta}</div>
      ) : null}
    </div>
  );
}

export function StatusBadge({ label }: { label: string }) {
  return (
    <Badge variant="outline" className="rounded-full border-border/70">
      {label}
    </Badge>
  );
}
