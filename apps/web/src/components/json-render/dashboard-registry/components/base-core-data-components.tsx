'use client';

import { TrendingDown, TrendingUp } from '@tuturuuu/icons';
import type {
  JsonRenderBarChartProps,
  JsonRenderComponentContext,
  JsonRenderMetricProps,
  JsonRenderProgressProps,
} from '@tuturuuu/types';
import { Progress } from '@tuturuuu/ui/progress';
import { cn } from '@tuturuuu/utils/format';
import type { StatDisplayProps } from '../shared';
import { resolveRegistryIcon } from './base-core-icon';

export const dashboardBaseDataComponents = {
  Progress: ({
    props,
  }: JsonRenderComponentContext<JsonRenderProgressProps>) => {
    const raw = Number(props.value);
    const safe = Number.isFinite(raw) ? raw : 0;
    const clampedValue = Math.max(0, Math.min(100, safe));
    const resolveColor = () => {
      if (props.color && props.color !== 'default') return props.color;
      if (clampedValue > 66) return 'success';
      if (clampedValue > 33) return 'warning';
      return 'error';
    };
    const color = resolveColor();
    const colorClasses: Record<string, string> = {
      success: '[&>div]:bg-dynamic-green',
      warning: '[&>div]:bg-dynamic-yellow',
      error: '[&>div]:bg-dynamic-red',
    };
    return (
      <div className="flex w-full flex-col gap-1.5">
        {(props.label || props.showValue) && (
          <div className="flex items-center justify-between text-xs">
            {props.label && (
              <span className="font-medium text-foreground/70">
                {props.label}
              </span>
            )}
            {props.showValue && (
              <span className="font-mono text-[11px] text-muted-foreground">
                {Math.round(clampedValue)}%
              </span>
            )}
          </div>
        )}
        <Progress
          value={clampedValue}
          className={cn('h-2 rounded-full', colorClasses[color])}
        />
      </div>
    );
  },
  Metric: ({ props }: JsonRenderComponentContext<JsonRenderMetricProps>) => {
    const trend = props.trend;
    const trendValue = props.trendValue;
    const showTrend = trend && trend !== 'neutral';

    return (
      <div className="flex flex-col gap-1 rounded-lg border border-border/60 bg-card/70 p-4 text-left shadow-sm backdrop-blur-sm">
        <div className="font-medium text-[11px] text-muted-foreground uppercase tracking-wider">
          {props.title}
        </div>
        <div className="flex items-baseline gap-2">
          <div className="font-bold text-2xl tracking-tighter">
            {props.value}
          </div>
          {showTrend && (
            <div
              className={cn(
                'flex items-center gap-0.5 font-semibold text-[13px]',
                trend === 'up' ? 'text-dynamic-green' : 'text-dynamic-red'
              )}
            >
              {trend === 'up' ? (
                <TrendingUp aria-hidden className="size-3.5" />
              ) : (
                <TrendingDown aria-hidden className="size-3.5" />
              )}
              {trendValue}
            </div>
          )}
          {trend === 'neutral' && trendValue && (
            <div className="font-medium text-[13px] text-muted-foreground">
              {trendValue}
            </div>
          )}
        </div>
      </div>
    );
  },
  Stat: ({ props }: JsonRenderComponentContext<StatDisplayProps>) => {
    const stat = props;
    const IconComp = resolveRegistryIcon(stat.icon);
    const colorClass =
      stat.variant === 'success'
        ? 'text-dynamic-green'
        : stat.variant === 'warning'
          ? 'text-dynamic-yellow'
          : stat.variant === 'error'
            ? 'text-dynamic-red'
            : 'text-foreground';
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-muted/5 px-2.5 py-1.5 transition-colors hover:bg-muted/10">
        {IconComp && (
          <IconComp
            size={14}
            className={cn(
              'shrink-0',
              stat.variant ? colorClass : 'text-muted-foreground'
            )}
          />
        )}
        <div className="flex flex-col leading-tight">
          <span className="text-[10px] text-muted-foreground/80 uppercase tracking-wide">
            {stat.label}
          </span>
          <span
            className={cn('font-semibold text-sm tracking-tight', colorClass)}
          >
            {stat.value}
          </span>
        </div>
      </div>
    );
  },
  BarChart: ({
    props,
  }: JsonRenderComponentContext<JsonRenderBarChartProps>) => {
    const normalizedData = (props.data ?? []).map((item) => {
      const parsed = Number(item.value);
      return {
        ...item,
        value: Number.isFinite(parsed) ? Math.max(0, parsed) : 0,
      };
    });
    const maxValue = Math.max(
      1,
      ...(normalizedData.length ? normalizedData.map((d) => d.value) : [100])
    );

    const resolveBarColor = (color?: string): string | undefined => {
      if (!color) return undefined;
      const normalized = String(color).toLowerCase();
      const tokenMap: Record<string, string> = {
        success: 'var(--color-dynamic-green)',
        warning: 'var(--color-dynamic-yellow)',
        error: 'var(--color-dynamic-red)',
        'dynamic-green': 'var(--color-dynamic-green)',
        'dynamic-yellow': 'var(--color-dynamic-yellow)',
        'dynamic-red': 'var(--color-dynamic-red)',
        green: 'var(--color-dynamic-green)',
        blue: 'var(--color-dynamic-blue)',
        orange: 'var(--color-dynamic-orange)',
        purple: 'var(--color-dynamic-purple)',
        cyan: 'var(--color-dynamic-cyan)',
        pink: 'var(--color-dynamic-pink)',
      };
      return tokenMap[normalized] ?? color;
    };

    return (
      <div className="flex w-full flex-col gap-4 py-2">
        <div
          className="flex items-end justify-between gap-2 px-1"
          style={{ height: props.height || 120 }}
        >
          {normalizedData.map((item) => {
            const barColor = resolveBarColor(item.color);
            const itemKey = `${item.label}-${item.value}-${item.color ?? 'default'}`;
            return (
              <div
                key={itemKey}
                className="group relative flex flex-1 flex-col items-center gap-2"
              >
                <div
                  className={cn(
                    'w-full rounded-t-md transition-all duration-500 group-hover:opacity-80',
                    barColor ? '' : 'bg-primary/80'
                  )}
                  style={{
                    height: `${(item.value / maxValue) * 100}%`,
                    ...(barColor ? { backgroundColor: barColor } : {}),
                  }}
                />
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 scale-0 rounded border border-border/60 bg-popover px-1.5 py-0.5 text-[10px] text-popover-foreground shadow-sm transition-all group-hover:scale-100">
                  {item.value}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex justify-between gap-1 px-1">
          {normalizedData.map((item) => (
            <div
              key={`${item.label}-${item.value}-${item.color ?? 'default'}`}
              className="wrap-break-word flex-1 whitespace-normal text-center text-[10px] text-muted-foreground uppercase leading-tight tracking-tight"
            >
              {item.label}
            </div>
          ))}
        </div>
      </div>
    );
  },
} as const;
