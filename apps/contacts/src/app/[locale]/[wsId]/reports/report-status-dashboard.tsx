import { Card, CardContent } from '@tuturuuu/ui/card';
import { cn } from '@tuturuuu/utils/format';
import type { ComponentType, ReactNode } from 'react';

export function ReportStatusDashboard({
  total,
  totalLabel,
  actions,
  toolbar,
  children,
  columns = 5,
  label,
}: {
  total?: number;
  totalLabel: string;
  actions: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
  columns?: 3 | 5;
  label?: string;
}) {
  return (
    <Card
      aria-label={label}
      className="min-w-0 overflow-hidden border-border/60 shadow-sm"
    >
      <CardContent className="p-0">
        <div className="grid gap-6 p-6 xl:grid-cols-[minmax(0,0.72fr)_minmax(0,2.28fr)]">
          <div className="min-w-0 space-y-4">
            <div>
              <p className="text-muted-foreground text-sm">{totalLabel}</p>
              <p className="font-bold text-4xl tabular-nums tracking-tight">
                {total?.toLocaleString() ?? '—'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">{actions}</div>
          </div>
          <div
            className={cn(
              'grid min-w-0 gap-2 sm:grid-cols-2',
              columns === 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-3'
            )}
          >
            {children}
          </div>
        </div>
        {toolbar && (
          <div className="border-border/60 border-t px-6 py-4">{toolbar}</div>
        )}
      </CardContent>
    </Card>
  );
}

export function ReportStatusCard({
  label,
  count,
  total,
  active,
  onClick,
  appearance,
}: {
  label: string;
  count?: number;
  total?: number;
  active: boolean;
  onClick: () => void;
  appearance: {
    icon: ComponentType<{ className?: string }>;
    className: string;
    iconClassName?: string;
  };
}) {
  const percentage =
    total && count !== undefined ? Math.round((count / total) * 100) : 0;
  const Icon = appearance.icon;
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'group min-w-0 rounded-xl border bg-background px-3.5 py-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20'
          : 'border-border/70 hover:border-border hover:shadow-sm'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className={cn(
            'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border',
            appearance.className
          )}
        >
          <Icon className={cn('h-3.5 w-3.5', appearance.iconClassName)} />
        </span>
        {percentage > 0 && (
          <span
            aria-hidden="true"
            className="font-medium text-muted-foreground text-xs tabular-nums"
          >
            {percentage}%
          </span>
        )}
      </div>
      <div className="mt-2.5 space-y-0.5">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="font-bold text-lg tabular-nums tracking-tight">
          {count?.toLocaleString() ?? '—'}
        </p>
      </div>
    </button>
  );
}
