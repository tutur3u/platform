import type { TaskProgressMetric } from '@tuturuuu/tasks-api';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { cn } from '@tuturuuu/utils/format';
import type { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

export type Translate = ReturnType<typeof useTranslations>;

export const today = () => new Date().toISOString().slice(0, 10);

const NUMBER = new Intl.NumberFormat();
export function formatNumber(
  value: number | null | undefined,
  maximumFractionDigits = 0
) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits }).format(
    Number(value ?? 0)
  );
}

export function SummaryCard({
  accent = 'blue',
  hint,
  icon,
  label,
  value,
}: {
  accent?: 'blue' | 'green' | 'amber' | 'purple';
  hint?: ReactNode;
  icon: ReactNode;
  label: string;
  value: number;
}) {
  const accentClass = {
    blue: 'bg-dynamic-blue/10 text-dynamic-blue',
    green: 'bg-dynamic-green/10 text-dynamic-green',
    amber: 'bg-dynamic-amber/10 text-dynamic-amber',
    purple: 'bg-dynamic-purple/10 text-dynamic-purple',
  }[accent];

  return (
    <Card className="group overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-md">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-muted-foreground text-sm">
          <span
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-lg transition-transform group-hover:scale-110',
              accentClass
            )}
          >
            {icon}
          </span>
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="font-bold text-3xl tracking-tight">
          {NUMBER.format(Number(value))}
        </div>
        {hint ? (
          <div className="mt-1 text-muted-foreground text-xs">{hint}</div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function MetricSelect({
  metrics,
  name = 'metric_id',
  selectedMetric,
}: {
  metrics: TaskProgressMetric[];
  name?: string;
  selectedMetric: TaskProgressMetric | null;
}) {
  return (
    <select
      className="h-11 w-full rounded-xl border bg-background px-3 text-sm shadow-sm outline-none transition focus:border-dynamic-blue focus:ring-2 focus:ring-dynamic-blue/15"
      defaultValue={selectedMetric?.id}
      name={name}
      required
    >
      {metrics.map((metric) => (
        <option key={metric.id} value={metric.id}>
          {metric.name}
        </option>
      ))}
    </select>
  );
}

export function InsightCard({
  accent = false,
  label,
  value,
  sublabel,
}: {
  accent?: boolean;
  label: string;
  value: string;
  sublabel?: string;
}) {
  return (
    <Card
      className={accent ? 'border-dynamic-green/30 bg-dynamic-green/5' : ''}
    >
      <CardContent className="flex items-center justify-between gap-4 py-5">
        <div className="min-w-0">
          <span className="text-muted-foreground text-sm">{label}</span>
          {sublabel ? (
            <div className="truncate text-muted-foreground text-xs">
              {sublabel}
            </div>
          ) : null}
        </div>
        <strong className="shrink-0 text-xl tabular-nums">{value}</strong>
      </CardContent>
    </Card>
  );
}
