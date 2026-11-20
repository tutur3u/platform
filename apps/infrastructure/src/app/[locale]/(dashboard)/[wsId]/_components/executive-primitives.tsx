import { ArrowUpRight } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import type { ReactNode } from 'react';

export function ExecutivePanel({
  action,
  children,
  className,
  description,
  title,
}: {
  action?: { href: string; label: string };
  children: ReactNode;
  className?: string;
  description?: string;
  title: string;
}) {
  return (
    <section
      className={cn(
        'flex flex-col gap-4 rounded-lg border border-border bg-card p-5',
        className
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold text-base">{title}</h2>
          {description && (
            <p className="mt-1 text-muted-foreground text-sm">{description}</p>
          )}
        </div>
        {action && (
          <Link
            className="inline-flex shrink-0 items-center gap-1 text-primary text-sm hover:underline"
            href={action.href}
          >
            {action.label}
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </header>
      {children}
    </section>
  );
}

export function UnavailableBadge({ label }: { label: string }) {
  return (
    <Badge className="font-normal" variant="warning">
      {label}
    </Badge>
  );
}

export function KpiTile({
  detail,
  icon,
  label,
  unavailableLabel,
  value,
}: {
  detail?: ReactNode;
  icon: ReactNode;
  label: string;
  unavailableLabel: string;
  /** `null` renders an explicit "unavailable" marker, never a zero. */
  value: string | null;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-muted-foreground text-sm">
          {label}
        </span>
        <span className="rounded-md bg-primary/10 p-2 text-primary">
          {icon}
        </span>
      </div>
      {value === null ? (
        <UnavailableBadge label={unavailableLabel} />
      ) : (
        <span className="font-bold text-3xl tabular-nums tracking-tight">
          {value}
        </span>
      )}
      {detail && value !== null && (
        <div className="text-muted-foreground text-xs">{detail}</div>
      )}
    </div>
  );
}

export function ShareBar({
  label,
  percentage,
  value,
}: {
  label: string;
  percentage: number;
  value: string;
}) {
  const width = Math.max(0, Math.min(100, percentage));
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground tabular-nums">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}
