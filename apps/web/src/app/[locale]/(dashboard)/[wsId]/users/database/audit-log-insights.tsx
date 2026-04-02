'use client';

import { CalendarRange, RefreshCcw, Upload, Users } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { Dialog, DialogContent, DialogTrigger } from '@tuturuuu/ui/dialog';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useTransition } from 'react';
import { AuditLogBackfillDialogContent } from './audit-log-backfill-dialog-content';
import { AuditLogExportDialogContent } from './audit-log-export-dialog-content';
import {
  getFallbackAuditLogMonthValue,
  getFallbackAuditLogYearValue,
} from './audit-log-time';
import type {
  AuditLogChartStat,
  AuditLogEventKindFilter,
  AuditLogInsightSummary,
  AuditLogPeriod,
  AuditLogSourceFilter,
  AuditLogTimeOption,
} from './audit-log-types';

interface Props {
  wsId: string;
  locale: string;
  selectedPeriod: AuditLogPeriod;
  selectedValue: string;
  timeOptions: AuditLogTimeOption[];
  summary: AuditLogInsightSummary;
  chartStats: AuditLogChartStat[];
  eventKind: AuditLogEventKindFilter;
  source: AuditLogSourceFilter;
  affectedUserQuery: string;
  actorQuery: string;
  canExport: boolean;
  canRepairStatusHistory: boolean;
}

function formatCount(value: number, locale: string) {
  return new Intl.NumberFormat(locale).format(value);
}

type AuditLogMetricLabelKey =
  | 'archived_actions'
  | 'reactivated_actions'
  | 'archive_timing_changes'
  | 'profile_updates'
  | 'total_events'
  | 'users_affected';

function buildMetricLabel(
  t: ReturnType<typeof useTranslations>,
  key: AuditLogMetricLabelKey
) {
  if (t.has(key)) {
    return t(key);
  }

  switch (key) {
    case 'archived_actions':
      return 'Archived actions';
    case 'reactivated_actions':
      return 'Reactivated actions';
    case 'archive_timing_changes':
      return 'Archive timing changes';
    case 'profile_updates':
      return 'Profile updates';
    case 'total_events':
      return 'Total changes';
    case 'users_affected':
      return 'Users affected';
  }
}

function normalizeChartStat(stat: AuditLogChartStat) {
  return {
    ...stat,
    totalCount: stat.totalCount ?? 0,
    archivedCount: stat.archivedCount ?? 0,
    reactivatedCount: stat.reactivatedCount ?? 0,
    archiveTimingCount: stat.archiveTimingCount ?? 0,
    profileUpdateCount: stat.profileUpdateCount ?? 0,
  };
}

export function AuditLogInsights({
  wsId,
  locale,
  selectedPeriod,
  selectedValue,
  timeOptions,
  summary,
  chartStats,
  eventKind,
  source,
  affectedUserQuery,
  actorQuery,
  canExport,
  canRepairStatusHistory,
}: Props) {
  const t = useTranslations('audit-log-insights');
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const selectedTimeOption =
    timeOptions.find((option) => option.value === selectedValue) ||
    timeOptions[0];
  const selectedPeriodLabel =
    selectedPeriod === 'yearly' ? t('period_yearly') : t('period_monthly');
  const peakBucketText =
    summary.peakBucketLabel && summary.peakBucketCount > 0
      ? `${summary.peakBucketLabel} (${formatCount(
          summary.peakBucketCount,
          locale
        )})`
      : t('peak_bucket_empty');
  const topActorText = summary.topActorName
    ? `${summary.topActorName} (${formatCount(summary.topActorCount, locale)})`
    : t('top_actor_empty');

  const updateSearchParams = (mutator: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams.toString());

    params.set('tab', 'audit-log');
    mutator(params);
    params.delete('logPage');

    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`);
    });
  };

  const handlePeriodChange = (period: AuditLogPeriod) => {
    updateSearchParams((params) => {
      params.set('logPeriod', period);

      if (period === 'yearly' && !params.get('logYear')) {
        params.set(
          'logYear',
          selectedPeriod === 'monthly'
            ? selectedValue.slice(0, 4)
            : getFallbackAuditLogYearValue()
        );
      }

      if (period === 'monthly' && !params.get('logMonth')) {
        params.set(
          'logMonth',
          selectedPeriod === 'yearly'
            ? `${selectedValue}-01`
            : getFallbackAuditLogMonthValue()
        );
      }
    });
  };

  const handleTimeValueChange = (value: string) => {
    updateSearchParams((params) => {
      if (selectedPeriod === 'yearly') {
        params.set('logYear', value);
      } else {
        params.set('logMonth', value);
      }
    });
  };

  const normalizedChartStats = chartStats.map(normalizeChartStat);
  const maxChartCount = Math.max(
    ...normalizedChartStats.map((stat) => stat.totalCount),
    1
  );

  return (
    <Card className="overflow-hidden border-border/60 shadow-sm">
      <CardHeader className="gap-5 border-border/40 border-b bg-gradient-to-br from-background via-background to-muted/50">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="rounded-full px-3 py-1">
                {t('overview_badge')}
              </Badge>
              <Badge variant="outline" className="rounded-full px-3 py-1">
                {selectedPeriodLabel}
              </Badge>
              {selectedTimeOption ? (
                <Badge variant="outline" className="rounded-full px-3 py-1">
                  <CalendarRange className="mr-1 h-3.5 w-3.5" />
                  {selectedTimeOption.label}
                </Badge>
              ) : null}
              {eventKind !== 'all' ? (
                <Badge variant="outline" className="rounded-full px-3 py-1">
                  {t(`event_kind_badge.${eventKind}`)}
                </Badge>
              ) : null}
              {source !== 'all' ? (
                <Badge variant="outline" className="rounded-full px-3 py-1">
                  {t(`source_badge.${source}`)}
                </Badge>
              ) : null}
              {affectedUserQuery ? (
                <Badge variant="outline" className="rounded-full px-3 py-1">
                  {t('affected_user_badge', { query: affectedUserQuery })}
                </Badge>
              ) : null}
              {actorQuery ? (
                <Badge variant="outline" className="rounded-full px-3 py-1">
                  {t('actor_badge', { query: actorQuery })}
                </Badge>
              ) : null}
            </div>
            <div className="space-y-1">
              <CardTitle className="text-2xl tracking-tight">
                {t('title')}
              </CardTitle>
              <CardDescription className="max-w-2xl text-sm/6">
                {t('description', {
                  period: selectedTimeOption?.label || selectedValue,
                })}
              </CardDescription>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-2xl border border-border/60 bg-background/80 p-3">
                <p className="text-muted-foreground text-sm">
                  {t('peak_bucket_label')}
                </p>
                <p className="mt-1 font-medium">{peakBucketText}</p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-background/80 p-3">
                <p className="text-muted-foreground text-sm">
                  {t('top_actor_label')}
                </p>
                <p className="mt-1 font-medium">{topActorText}</p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-background/80 p-3">
                <p className="text-muted-foreground text-sm">
                  {t('users_affected')}
                </p>
                <p className="mt-1 font-medium">
                  {formatCount(summary.affectedUsersCount, locale)}
                </p>
              </div>
            </div>
          </div>

          <div className="flex w-full flex-col gap-3 xl:max-w-sm">
            <div className="grid gap-2">
              <Label className="text-muted-foreground text-xs uppercase tracking-[0.2em]">
                {t('period_label')}
              </Label>
              <div className="grid grid-cols-2 gap-2 rounded-2xl border border-border/60 bg-muted/30 p-1">
                <Button
                  type="button"
                  variant={selectedPeriod === 'monthly' ? 'default' : 'ghost'}
                  className="h-10 rounded-xl"
                  disabled={isPending}
                  onClick={() => handlePeriodChange('monthly')}
                >
                  {t('period_monthly')}
                </Button>
                <Button
                  type="button"
                  variant={selectedPeriod === 'yearly' ? 'default' : 'ghost'}
                  className="h-10 rounded-xl"
                  disabled={isPending}
                  onClick={() => handlePeriodChange('yearly')}
                >
                  {t('period_yearly')}
                </Button>
              </div>
            </div>

            <div className="grid gap-2">
              <Label className="text-muted-foreground text-xs uppercase tracking-[0.2em]">
                {selectedPeriod === 'yearly'
                  ? t('year_label')
                  : t('month_label')}
              </Label>
              <Select
                value={selectedValue}
                onValueChange={handleTimeValueChange}
                disabled={isPending}
              >
                <SelectTrigger className="h-11 rounded-xl bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {timeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-wrap gap-2">
              {canExport ? (
                <Dialog>
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      className="h-11 flex-1 justify-between rounded-xl border-dashed"
                    >
                      <span className="flex items-center gap-2">
                        <Upload className="h-4 w-4" />
                        {t('export_button')}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {t('excel_default')}
                      </span>
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-sm">
                    <AuditLogExportDialogContent
                      wsId={wsId}
                      locale={locale}
                      period={selectedPeriod}
                      month={
                        selectedPeriod === 'monthly' ? selectedValue : undefined
                      }
                      year={
                        selectedPeriod === 'yearly' ? selectedValue : undefined
                      }
                      eventKind={eventKind}
                      source={source}
                      affectedUserQuery={affectedUserQuery}
                      actorQuery={actorQuery}
                    />
                  </DialogContent>
                </Dialog>
              ) : null}

              {canRepairStatusHistory ? (
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="h-11 rounded-xl">
                      <RefreshCcw className="h-4 w-4" />
                      {t('repair_button')}
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg">
                    <AuditLogBackfillDialogContent wsId={wsId} />
                  </DialogContent>
                </Dialog>
              ) : null}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 p-6">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          <MetricCard
            label={buildMetricLabel(t, 'total_events')}
            value={formatCount(summary.totalEvents, locale)}
          />
          <MetricCard
            label={buildMetricLabel(t, 'archived_actions')}
            value={formatCount(summary.archivedEvents, locale)}
          />
          <MetricCard
            label={buildMetricLabel(t, 'reactivated_actions')}
            value={formatCount(summary.reactivatedEvents, locale)}
          />
          <MetricCard
            label={buildMetricLabel(t, 'archive_timing_changes')}
            value={formatCount(summary.archiveTimingEvents, locale)}
          />
          <MetricCard
            label={buildMetricLabel(t, 'profile_updates')}
            value={formatCount(summary.profileUpdates, locale)}
          />
          <MetricCard
            label={buildMetricLabel(t, 'users_affected')}
            value={formatCount(summary.affectedUsersCount, locale)}
            icon={<Users className="h-4 w-4" />}
          />
        </div>

        <div className="space-y-2">
          <div>
            <h3 className="font-semibold">{t('activity_title')}</h3>
            <p className="text-muted-foreground text-sm">
              {t('activity_description')}
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-muted-foreground text-xs">
            <ChartLegendItem
              label={buildMetricLabel(t, 'archived_actions')}
              swatchClassName="bg-dynamic-orange"
            />
            <ChartLegendItem
              label={buildMetricLabel(t, 'reactivated_actions')}
              swatchClassName="bg-dynamic-green"
            />
            <ChartLegendItem
              label={buildMetricLabel(t, 'archive_timing_changes')}
              swatchClassName="bg-dynamic-blue"
            />
            <ChartLegendItem
              label={buildMetricLabel(t, 'profile_updates')}
              swatchClassName="bg-dynamic-gray"
            />
          </div>
          <div className="flex min-h-24 items-end gap-2 rounded-2xl border border-border/60 bg-background/80 p-4">
            {normalizedChartStats.length > 0 ? (
              normalizedChartStats.map((stat) => (
                <div
                  key={stat.key}
                  className="flex flex-1 flex-col items-center gap-2"
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="flex w-full cursor-default flex-col justify-end overflow-hidden rounded-t-full bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        style={{
                          minHeight: stat.totalCount > 0 ? '12px' : '4px',
                          height: `${Math.max(
                            4,
                            (stat.totalCount / maxChartCount) * 88
                          )}px`,
                        }}
                        aria-label={`${stat.tooltipLabel}: ${formatCount(stat.totalCount, locale)}`}
                      >
                        {stat.profileUpdateCount > 0 ? (
                          <div
                            className="w-full bg-dynamic-gray/80"
                            style={{
                              height: `${(stat.profileUpdateCount / stat.totalCount) * 100}%`,
                            }}
                          />
                        ) : null}
                        {stat.archiveTimingCount > 0 ? (
                          <div
                            className="w-full bg-dynamic-blue/80"
                            style={{
                              height: `${(stat.archiveTimingCount / stat.totalCount) * 100}%`,
                            }}
                          />
                        ) : null}
                        {stat.reactivatedCount > 0 ? (
                          <div
                            className="w-full bg-dynamic-green/80"
                            style={{
                              height: `${(stat.reactivatedCount / stat.totalCount) * 100}%`,
                            }}
                          />
                        ) : null}
                        {stat.archivedCount > 0 ? (
                          <div
                            className="w-full bg-dynamic-orange/80"
                            style={{
                              height: `${(stat.archivedCount / stat.totalCount) * 100}%`,
                            }}
                          />
                        ) : null}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent
                      side="top"
                      className="min-w-48 rounded-xl p-3"
                    >
                      <ChartTooltipContent
                        title={stat.tooltipLabel}
                        rows={[
                          {
                            label: buildMetricLabel(t, 'total_events'),
                            value: formatCount(stat.totalCount, locale),
                          },
                          {
                            label: buildMetricLabel(t, 'archived_actions'),
                            value: formatCount(stat.archivedCount, locale),
                            swatchClassName: 'bg-dynamic-orange',
                          },
                          {
                            label: buildMetricLabel(t, 'reactivated_actions'),
                            value: formatCount(stat.reactivatedCount, locale),
                            swatchClassName: 'bg-dynamic-green',
                          },
                          {
                            label: buildMetricLabel(
                              t,
                              'archive_timing_changes'
                            ),
                            value: formatCount(stat.archiveTimingCount, locale),
                            swatchClassName: 'bg-dynamic-blue',
                          },
                          {
                            label: buildMetricLabel(t, 'profile_updates'),
                            value: formatCount(stat.profileUpdateCount, locale),
                            swatchClassName: 'bg-dynamic-gray',
                          },
                        ]}
                      />
                    </TooltipContent>
                  </Tooltip>
                  <span className="text-[11px] text-muted-foreground">
                    {stat.label}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-muted-foreground text-sm">
                {t('no_activity')}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MetricCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-background/80 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm/6">{label}</p>
        {icon}
      </div>
      <p className="mt-3 font-semibold text-3xl tracking-tight">{value}</p>
    </div>
  );
}

function ChartLegendItem({
  label,
  swatchClassName,
}: {
  label: string;
  swatchClassName: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-2.5 w-2.5 rounded-full ${swatchClassName}`} />
      <span>{label}</span>
    </div>
  );
}

function ChartTooltipContent({
  title,
  rows,
}: {
  title: string;
  rows: Array<{
    label: string;
    value: string;
    swatchClassName?: string;
  }>;
}) {
  return (
    <div className="space-y-2">
      <div className="font-medium">{title}</div>
      <div className="space-y-1.5">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between gap-4 text-xs"
          >
            <div className="flex items-center gap-2 text-muted-foreground">
              {row.swatchClassName ? (
                <span
                  className={`h-2.5 w-2.5 rounded-full ${row.swatchClassName}`}
                />
              ) : null}
              <span>{row.label}</span>
            </div>
            <span className="font-medium text-foreground">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
