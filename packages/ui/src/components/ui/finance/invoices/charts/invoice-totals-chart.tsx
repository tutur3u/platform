'use client';

import { BarChart3, Eye, EyeOff, Layers, Users, Wallet } from '@tuturuuu/icons';
import type {
  InvoiceAnalyticsGroupBy,
  InvoiceAnalyticsMetric,
  InvoiceAnalyticsPeriod,
  InvoiceTotalsByGroup,
} from '@tuturuuu/types/primitives/Invoice';
import { cn } from '@tuturuuu/utils/format';
import { useLocale, useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Avatar, AvatarFallback, AvatarImage } from '../../../avatar';
import { Badge } from '../../../badge';
import { Button } from '../../../button';
import { Card, CardContent, CardHeader } from '../../../card';
import { Skeleton } from '../../../skeleton';
import {
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  Tooltip as TooltipUI,
} from '../../../tooltip';

// Re-export types for convenience
export type {
  InvoiceTotalsByGroup,
  InvoiceAnalyticsPeriod,
  InvoiceAnalyticsMetric,
  InvoiceAnalyticsGroupBy,
};

// Chart display mode for creator view
type ChartMode = 'grouped' | 'stacked';

// Cookie helper functions
const setCookie = (name: string, value: string, days = 365) => {
  const expires = new Date();
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
  // biome-ignore lint/suspicious/noDocumentCookie: Used for finance confidential mode state persistence
  document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/;SameSite=Lax`;
};

const getCookie = (name: string): string | null => {
  if (typeof document === 'undefined') return null;
  const nameEQ = `${name}=`;
  const ca = document.cookie.split(';');
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i];
    if (!c) continue;
    while (c.charAt(0) === ' ') c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
  }
  return null;
};

// Color palette for groups
const GROUP_COLORS = [
  { light: '#2563eb', dark: '#3b82f6' }, // Blue
  { light: '#16a34a', dark: '#4ade80' }, // Green
  { light: '#dc2626', dark: '#f87171' }, // Red
  { light: '#9333ea', dark: '#a855f7' }, // Purple
  { light: '#ea580c', dark: '#fb923c' }, // Orange
  { light: '#0891b2', dark: '#22d3ee' }, // Cyan
  { light: '#be185d', dark: '#f472b6' }, // Pink
  { light: '#4d7c0f', dark: '#a3e635' }, // Lime
];

// Props for date range mode (custom filter applied)
interface DateRangeProps {
  walletData: InvoiceTotalsByGroup[];
  creatorData: InvoiceTotalsByGroup[];
  hasDateRange: true;
  startDate: string;
  endDate: string;
  className?: string;
}

// Props for default mode (no date range, period tabs)
interface DefaultModeProps {
  dailyWalletData: InvoiceTotalsByGroup[];
  weeklyWalletData: InvoiceTotalsByGroup[];
  monthlyWalletData: InvoiceTotalsByGroup[];
  dailyCreatorData: InvoiceTotalsByGroup[];
  weeklyCreatorData: InvoiceTotalsByGroup[];
  monthlyCreatorData: InvoiceTotalsByGroup[];
  hasDateRange: false;
  className?: string;
}

export type InvoiceTotalsChartProps = DateRangeProps | DefaultModeProps;

export function InvoiceTotalsChart(props: InvoiceTotalsChartProps) {
  const locale = useLocale();
  const t = useTranslations('invoice-analytics');
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const [period, setPeriod] = useState<InvoiceAnalyticsPeriod>('daily');
  const [metric, setMetric] = useState<InvoiceAnalyticsMetric>('amount');
  const [groupBy, setGroupBy] = useState<InvoiceAnalyticsGroupBy>('wallet');
  const [chartMode, setChartMode] = useState<ChartMode>('stacked');
  const [isConfidential, setIsConfidential] = useState(true);

  // Load confidential mode from cookie on mount
  useEffect(() => {
    const saved = getCookie('finance-confidential-mode');
    if (saved !== null) {
      setIsConfidential(saved === 'true');
    }

    const handleStorageChange = () => {
      const newValue = getCookie('finance-confidential-mode');
      if (newValue !== null) {
        setIsConfidential(newValue === 'true');
      }
    };

    window.addEventListener(
      'finance-confidential-mode-change',
      handleStorageChange as EventListener
    );

    return () => {
      window.removeEventListener(
        'finance-confidential-mode-change',
        handleStorageChange as EventListener
      );
    };
  }, []);

  const toggleConfidential = () => {
    const newValue = !isConfidential;
    setIsConfidential(newValue);
    setCookie('finance-confidential-mode', String(newValue));
    window.dispatchEvent(new Event('finance-confidential-mode-change'));
  };

  // Get raw data based on mode, period, and groupBy
  const rawData = useMemo(() => {
    if (props.hasDateRange) {
      return groupBy === 'wallet' ? props.walletData : props.creatorData;
    }

    // Default mode with period selection
    if (groupBy === 'wallet') {
      switch (period) {
        case 'daily':
          return props.dailyWalletData;
        case 'weekly':
          return props.weeklyWalletData;
        case 'monthly':
          return props.monthlyWalletData;
        default:
          return props.dailyWalletData;
      }
    } else {
      switch (period) {
        case 'daily':
          return props.dailyCreatorData;
        case 'weekly':
          return props.weeklyCreatorData;
        case 'monthly':
          return props.monthlyCreatorData;
        default:
          return props.dailyCreatorData;
      }
    }
  }, [props, period, groupBy]);

  // Extract unique groups from data
  const groups = useMemo(() => {
    const groupMap = new Map<
      string,
      { name: string; avatarUrl?: string | null }
    >();
    rawData.forEach((item) => {
      if (item.group_id && item.group_name) {
        groupMap.set(item.group_id, {
          name: item.group_name,
          avatarUrl: item.group_avatar_url,
        });
      }
    });
    return Array.from(groupMap.entries()).map(([id, info]) => ({
      id,
      name: info.name,
      avatarUrl: info.avatarUrl,
    }));
  }, [rawData]);

  // Transform data for Recharts grouped bar format
  const chartData = useMemo(() => {
    const periodMap = new Map<string, Record<string, number | string>>();

    rawData.forEach((item) => {
      if (!periodMap.has(item.period)) {
        periodMap.set(item.period, { period: item.period });
      }
      const entry = periodMap.get(item.period)!;
      const value =
        metric === 'amount'
          ? Number(item.total_amount)
          : Number(item.invoice_count);
      entry[item.group_id] = value;
    });

    return Array.from(periodMap.values()).sort((a, b) =>
      String(a.period).localeCompare(String(b.period))
    );
  }, [rawData, metric]);

  // Calculate totals for summary
  const totals = useMemo(() => {
    const totalAmount = rawData.reduce(
      (sum, item) => sum + Number(item.total_amount),
      0
    );
    const totalCount = rawData.reduce(
      (sum, item) => sum + Number(item.invoice_count),
      0
    );
    return { totalAmount, totalCount };
  }, [rawData]);

  // Determine inferred period type for date range mode
  const inferredPeriod = useMemo((): InvoiceAnalyticsPeriod => {
    if (!props.hasDateRange) return period;

    const start = new Date(props.startDate);
    const end = new Date(props.endDate);
    const dayCount = Math.ceil(
      (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (dayCount <= 31) return 'daily';
    if (dayCount <= 90) return 'weekly';
    return 'monthly';
  }, [props, period]);

  const formatValue = (value: number) => {
    if (isConfidential && metric === 'amount') return '******';
    if (metric === 'count') {
      return value.toLocaleString(locale);
    }
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'VND',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatCompactValue = (value: number) => {
    if (isConfidential && metric === 'amount') return '***';
    if (metric === 'count') {
      return value.toLocaleString(locale);
    }
    return new Intl.NumberFormat(locale, {
      notation: 'compact',
      compactDisplay: 'short',
      maximumFractionDigits: 1,
    }).format(value);
  };

  const formatPeriodLabel = (value: string) => {
    try {
      const date = new Date(value);
      const activePeriod = props.hasDateRange ? inferredPeriod : period;
      switch (activePeriod) {
        case 'daily':
          return Intl.DateTimeFormat(locale, {
            month: 'short',
            day: 'numeric',
          }).format(date);
        case 'weekly':
          return Intl.DateTimeFormat(locale, {
            month: 'short',
            day: 'numeric',
          }).format(date);
        case 'monthly':
          return Intl.DateTimeFormat(locale, {
            month: locale === 'vi' ? 'numeric' : 'short',
            year: '2-digit',
          }).format(date);
        default:
          return value;
      }
    } catch {
      return value;
    }
  };

  const formatPeriodTooltip = (value: string) => {
    try {
      const date = new Date(value);
      const activePeriod = props.hasDateRange ? inferredPeriod : period;
      switch (activePeriod) {
        case 'daily':
          return Intl.DateTimeFormat(locale, {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }).format(date);
        case 'weekly': {
          const weekEnd = new Date(date);
          weekEnd.setDate(weekEnd.getDate() + 6);
          const startStr = Intl.DateTimeFormat(locale, {
            month: 'short',
            day: 'numeric',
          }).format(date);
          const endStr = Intl.DateTimeFormat(locale, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          }).format(weekEnd);
          return `${startStr} - ${endStr}`;
        }
        case 'monthly':
          return Intl.DateTimeFormat(locale, {
            month: 'long',
            year: 'numeric',
          }).format(date);
        default:
          return value;
      }
    } catch {
      return value;
    }
  };

  const getTitle = () => {
    if (props.hasDateRange) {
      const start = new Date(props.startDate);
      const end = new Date(props.endDate);
      const startStr = Intl.DateTimeFormat(locale, {
        month: 'short',
        day: 'numeric',
      }).format(start);
      const endStr = Intl.DateTimeFormat(locale, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }).format(end);
      return `${t('invoice_analytics')}: ${startStr} - ${endStr}`;
    }

    switch (period) {
      case 'daily':
        return t('daily_invoice_totals');
      case 'weekly':
        return t('weekly_invoice_totals');
      case 'monthly':
        return t('monthly_invoice_totals');
      default:
        return t('invoice_analytics');
    }
  };

  // Check if there's any actual data
  const hasData =
    chartData.length > 0 &&
    groups.length > 0 &&
    chartData.some((entry) => groups.some((g) => (entry[g.id] as number) > 0));

  const getColor = (index: number) => {
    const colorIndex = index % GROUP_COLORS.length;
    return isDark
      ? GROUP_COLORS[colorIndex]?.dark
      : GROUP_COLORS[colorIndex]?.light;
  };

  // Custom legend component
  const CustomLegend = () => {
    if (groups.length === 0) return null;

    return (
      <div className="mt-4 flex flex-wrap justify-center gap-3">
        {groups.map((group, index) => {
          const color = getColor(index);
          return (
            <div key={group.id} className="flex items-center gap-1.5">
              {groupBy === 'creator' && group.avatarUrl ? (
                <Avatar className="h-4 w-4">
                  <AvatarImage src={group.avatarUrl} />
                  <AvatarFallback
                    className="text-[8px]"
                    style={{ backgroundColor: color, color: '#fff' }}
                  >
                    {group.name.charAt(0)}
                  </AvatarFallback>
                </Avatar>
              ) : (
                <div
                  className="h-3 w-3 rounded"
                  style={{ backgroundColor: color }}
                />
              )}
              <span className="text-muted-foreground text-xs">
                {group.name}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  if (!hasData) {
    return (
      <Card className={cn('flex flex-col', props.className)}>
        <CardHeader className="pb-2">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold text-lg">{getTitle()}</h3>
              <div className="flex items-center gap-2">
                <GroupByToggle
                  groupBy={groupBy}
                  setGroupBy={setGroupBy}
                  t={t}
                />
              </div>
            </div>
            {!props.hasDateRange && (
              <div className="flex flex-wrap items-center gap-2">
                <PeriodTabs period={period} setPeriod={setPeriod} t={t} />
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex h-[280px] items-center justify-center">
          <p className="text-muted-foreground text-sm">
            {t('no_data_available')}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn('flex flex-col', props.className)}>
      <CardHeader className="pb-2">
        <div className="flex flex-col gap-3">
          {/* Top row: Title + Group toggle + Confidential */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <h3 className="font-semibold text-lg">{getTitle()}</h3>
              {/* Summary badges */}
              <div className="hidden items-center gap-2 sm:flex">
                <TooltipProvider>
                  <TooltipUI>
                    <TooltipTrigger asChild>
                      <Badge variant="secondary" className="font-mono">
                        {isConfidential
                          ? '***'
                          : formatCompactValue(totals.totalAmount)}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>
                        {t('total_amount')}: {formatValue(totals.totalAmount)}
                      </p>
                    </TooltipContent>
                  </TooltipUI>
                </TooltipProvider>
                <TooltipProvider>
                  <TooltipUI>
                    <TooltipTrigger asChild>
                      <Badge variant="outline" className="font-mono">
                        {totals.totalCount.toLocaleString(locale)}{' '}
                        {t('invoices')}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{t('total_invoices')}</p>
                    </TooltipContent>
                  </TooltipUI>
                </TooltipProvider>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <GroupByToggle groupBy={groupBy} setGroupBy={setGroupBy} t={t} />
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleConfidential}
                className="h-8 w-8 shrink-0"
                title={isConfidential ? t('show_values') : t('hide_values')}
              >
                {isConfidential ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Second row: Period tabs + Metric toggle (only when no date range) */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            {!props.hasDateRange && (
              <PeriodTabs period={period} setPeriod={setPeriod} t={t} />
            )}
            {props.hasDateRange && (
              <Badge variant="outline" className="text-muted-foreground">
                {t(`auto_${inferredPeriod}`)}
              </Badge>
            )}
            <MetricToggle metric={metric} setMetric={setMetric} t={t} />
            {groupBy === 'creator' && (
              <ChartModeToggle
                chartMode={chartMode}
                setChartMode={setChartMode}
                t={t}
              />
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-2 pb-4">
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            >
              <CartesianGrid
                vertical={false}
                strokeDasharray="3 3"
                opacity={0.3}
              />
              <XAxis
                dataKey="period"
                tickLine={false}
                axisLine={false}
                tickFormatter={formatPeriodLabel}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                interval="preserveStartEnd"
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickFormatter={(value: number) =>
                  typeof value === 'number' ? formatCompactValue(value) : value
                }
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                width={55}
              />
              <Tooltip
                content={
                  <CustomTooltip
                    chartMode={chartMode}
                    groupBy={groupBy}
                    groups={groups}
                    getColor={getColor}
                    formatValue={formatValue}
                    formatPeriodTooltip={formatPeriodTooltip}
                  />
                }
              />
              {groups.map((group, index) => {
                const isStacked =
                  groupBy === 'creator' && chartMode === 'stacked';
                const isFirst = index === 0;
                const isLast = index === groups.length - 1;
                return (
                  <Bar
                    key={group.id}
                    dataKey={group.id}
                    fill={getColor(index)}
                    stackId={isStacked ? 'stack' : undefined}
                    radius={
                      isStacked
                        ? isLast
                          ? [4, 4, 0, 0]
                          : isFirst
                            ? [0, 0, 4, 4]
                            : [0, 0, 0, 0]
                        : [4, 4, 0, 0]
                    }
                    maxBarSize={isStacked ? 48 : 32}
                  />
                );
              })}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <CustomLegend />
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function PeriodTabs({
  period,
  setPeriod,
  t,
}: {
  period: InvoiceAnalyticsPeriod;
  setPeriod: (p: InvoiceAnalyticsPeriod) => void;
  t: (key: 'daily' | 'weekly' | 'monthly') => string;
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
      {(['daily', 'weekly', 'monthly'] as const).map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => setPeriod(p)}
          className={cn(
            'rounded-md px-3 py-1.5 font-medium text-xs transition-colors',
            period === p
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {t(p)}
        </button>
      ))}
    </div>
  );
}

function MetricToggle({
  metric,
  setMetric,
  t,
}: {
  metric: InvoiceAnalyticsMetric;
  setMetric: (m: InvoiceAnalyticsMetric) => void;
  t: (key: 'amount' | 'count') => string;
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
      <button
        type="button"
        onClick={() => setMetric('amount')}
        className={cn(
          'rounded-md px-3 py-1.5 font-medium text-xs transition-colors',
          metric === 'amount'
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        )}
      >
        {t('amount')}
      </button>
      <button
        type="button"
        onClick={() => setMetric('count')}
        className={cn(
          'rounded-md px-3 py-1.5 font-medium text-xs transition-colors',
          metric === 'count'
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        )}
      >
        {t('count')}
      </button>
    </div>
  );
}

function GroupByToggle({
  groupBy,
  setGroupBy,
  t,
}: {
  groupBy: InvoiceAnalyticsGroupBy;
  setGroupBy: (g: InvoiceAnalyticsGroupBy) => void;
  t: (key: 'group_by_wallet' | 'group_by_creator') => string;
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
      <TooltipProvider>
        <TooltipUI>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setGroupBy('wallet')}
              className={cn(
                'rounded-md p-1.5 transition-colors',
                groupBy === 'wallet'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Wallet className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{t('group_by_wallet')}</p>
          </TooltipContent>
        </TooltipUI>
      </TooltipProvider>
      <TooltipProvider>
        <TooltipUI>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setGroupBy('creator')}
              className={cn(
                'rounded-md p-1.5 transition-colors',
                groupBy === 'creator'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Users className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{t('group_by_creator')}</p>
          </TooltipContent>
        </TooltipUI>
      </TooltipProvider>
    </div>
  );
}

function ChartModeToggle({
  chartMode,
  setChartMode,
  t,
}: {
  chartMode: ChartMode;
  setChartMode: (m: ChartMode) => void;
  t: (key: 'chart_grouped' | 'chart_stacked') => string;
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
      <TooltipProvider>
        <TooltipUI>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setChartMode('grouped')}
              className={cn(
                'rounded-md p-1.5 transition-colors',
                chartMode === 'grouped'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <BarChart3 className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{t('chart_grouped')}</p>
          </TooltipContent>
        </TooltipUI>
      </TooltipProvider>
      <TooltipProvider>
        <TooltipUI>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setChartMode('stacked')}
              className={cn(
                'rounded-md p-1.5 transition-colors',
                chartMode === 'stacked'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Layers className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{t('chart_stacked')}</p>
          </TooltipContent>
        </TooltipUI>
      </TooltipProvider>
    </div>
  );
}

// Custom tooltip component for the chart
function CustomTooltip({
  active,
  payload,
  label,
  chartMode,
  groupBy,
  groups,
  getColor,
  formatValue,
  formatPeriodTooltip,
}: {
  active?: boolean;
  payload?: any[];
  label?: string;
  chartMode: ChartMode;
  groupBy: InvoiceAnalyticsGroupBy;
  groups: { id: string; name: string; avatarUrl?: string | null }[];
  getColor: (index: number) => string | undefined;
  formatValue: (value: number) => string;
  formatPeriodTooltip: (value: string) => string;
}) {
  if (!active || !payload?.length || !label) return null;

  // Calculate total for percentage in stacked mode
  const total = payload.reduce(
    (sum: number, entry: any) => sum + (entry.value || 0),
    0
  );
  const isStacked = groupBy === 'creator' && chartMode === 'stacked';

  // Sort by value descending for better readability in stacked mode
  const sortedPayload = isStacked
    ? [...payload].sort((a, b) => (b.value || 0) - (a.value || 0))
    : payload;

  return (
    <div className="rounded-lg border bg-popover p-3 shadow-lg">
      <p className="mb-2 font-medium text-sm">{formatPeriodTooltip(label)}</p>
      {isStacked && total > 0 && (
        <p className="mb-2 border-b pb-2 font-semibold text-sm">
          Total: {formatValue(total)}
        </p>
      )}
      <div className="space-y-1.5">
        {sortedPayload.map((entry: any, index: number) => {
          const group = groups.find((g) => g.id === entry.dataKey);
          const color = getColor(
            groups.findIndex((g) => g.id === entry.dataKey)
          );
          const percentage =
            isStacked && total > 0
              ? ((entry.value / total) * 100).toFixed(1)
              : null;

          return (
            <div key={index} className="flex items-center gap-2">
              {groupBy === 'creator' && group?.avatarUrl ? (
                <Avatar className="h-4 w-4">
                  <AvatarImage src={group.avatarUrl} />
                  <AvatarFallback className="text-[8px]">
                    {group?.name?.charAt(0)}
                  </AvatarFallback>
                </Avatar>
              ) : (
                <div
                  className="h-3 w-3 rounded"
                  style={{ backgroundColor: color }}
                />
              )}
              <span className="flex-1 text-muted-foreground text-xs">
                {group?.name || entry.dataKey}
              </span>
              <span className="font-semibold text-sm" style={{ color }}>
                {formatValue(entry.value)}
              </span>
              {percentage && (
                <span className="text-muted-foreground text-xs">
                  ({percentage}%)
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Loading skeleton for the invoice totals chart
 */
export function InvoiceTotalsChartSkeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader className="pb-2">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-7 w-52" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-20 rounded-lg" />
              <Skeleton className="h-8 w-8 rounded-md" />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <Skeleton className="h-8 w-[180px] rounded-lg" />
            <Skeleton className="h-8 w-[120px] rounded-lg" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-2 pb-4">
        <div className="flex h-[280px] w-full items-end justify-between gap-1 px-4 py-4">
          {Array.from({ length: 14 }).map((_, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <Skeleton
                className="w-full rounded-t"
                style={{
                  height: `${Math.random() * 150 + 50}px`,
                }}
              />
            </div>
          ))}
        </div>
        <div className="mt-4 flex justify-center gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <Skeleton className="h-3 w-3 rounded" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
