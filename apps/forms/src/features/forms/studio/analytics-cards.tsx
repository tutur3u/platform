'use client';

import type { Globe } from '@tuturuuu/icons';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { cn } from '@tuturuuu/utils/format';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

import { PIE_COLORS } from './analytics-format';
import { ChartTooltipContent } from './chart-tooltip-content';

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = 'blue',
}: {
  label: string;
  value: string | number;
  icon: typeof Globe;
  tone?: 'blue' | 'orange' | 'green';
}) {
  const toneClassName =
    tone === 'orange'
      ? 'bg-dynamic-orange/10 text-dynamic-orange'
      : tone === 'green'
        ? 'bg-dynamic-green/10 text-dynamic-green'
        : 'bg-dynamic-blue/10 text-dynamic-blue';

  return (
    <Card className="overflow-hidden border-border/60 bg-card/80 shadow-sm">
      <CardContent className="space-y-2.5 p-4">
        <div className="flex items-center gap-3">
          <div className={cn('rounded-2xl p-2.5', toneClassName)}>
            <Icon className="h-4 w-4" />
          </div>
          <span className="text-[11px] text-muted-foreground uppercase tracking-[0.22em]">
            {label}
          </span>
        </div>
        <p className="font-semibold text-3xl leading-none">{value}</p>
      </CardContent>
    </Card>
  );
}

export function BreakdownCard({
  title,
  icon: Icon,
  items,
  emptyLabel,
  tone = 'blue',
}: {
  title: string;
  icon: typeof Globe;
  items: Array<{ label: string; value: number }>;
  emptyLabel: string;
  tone?: 'blue' | 'orange' | 'green';
}) {
  const maxValue = Math.max(...items.map((item) => item.value), 1);
  const barClassName =
    tone === 'orange'
      ? 'bg-dynamic-orange/60'
      : tone === 'green'
        ? 'bg-dynamic-green/60'
        : 'bg-dynamic-blue/60';

  return (
    <Card className="overflow-hidden border-border/60 bg-card/80 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {items.length === 0 ? (
          <div className="rounded-2xl border border-border/50 bg-background/50 px-4 py-5 text-muted-foreground text-sm">
            {emptyLabel}
          </div>
        ) : (
          items.map((item) => (
            <div key={item.label} className="space-y-1.5">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate">{item.label}</span>
                <span className="shrink-0 font-medium">{item.value}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    barClassName
                  )}
                  style={{ width: `${(item.value / maxValue) * 100}%` }}
                />
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

export function DistributionCard({
  title,
  items,
  emptyLabel,
}: {
  title: string;
  items: Array<{ label: string; value: number }>;
  emptyLabel: string;
}) {
  const total = items.reduce((sum, item) => sum + item.value, 0);

  return (
    <Card className="overflow-hidden border-border/60 bg-card/80 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="rounded-2xl border border-border/50 bg-background/50 px-4 py-6 text-muted-foreground text-sm">
            {emptyLabel}
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={items}
                    dataKey="value"
                    nameKey="label"
                    innerRadius={52}
                    outerRadius={78}
                    paddingAngle={3}
                  >
                    {items.map((item, index) => (
                      <Cell
                        key={`${item.label}-${index}`}
                        fill={PIE_COLORS[index % PIE_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltipContent hideLabel />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2.5">
              {items.map((item, index) => {
                const share =
                  total === 0 ? 0 : Math.round((item.value / total) * 100);
                return (
                  <div
                    key={item.label}
                    className="rounded-2xl border border-border/50 bg-background/45 px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{
                            backgroundColor:
                              PIE_COLORS[index % PIE_COLORS.length],
                          }}
                        />
                        <span className="truncate text-sm">{item.label}</span>
                      </div>
                      <span className="shrink-0 font-medium text-sm">
                        {item.value}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted/40">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${share}%`,
                          backgroundColor:
                            PIE_COLORS[index % PIE_COLORS.length],
                        }}
                      />
                    </div>
                    <p className="mt-1 text-muted-foreground text-xs">
                      {share}%
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
