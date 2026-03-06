'use client';

import {
  Activity,
  Archive,
  BarChart3,
  CalendarRange,
  Upload,
  Users,
} from '@tuturuuu/icons';
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
import type { ComponentType } from 'react';
import { useTransition } from 'react';
import { AuditLogExportDialogContent } from './audit-log-export-dialog-content';
import {
  getFallbackAuditLogMonthValue,
  getFallbackAuditLogYearValue,
} from './audit-log-time';
import type {
  AuditLogChartStat,
  AuditLogInsightSummary,
  AuditLogPeriod,
  AuditLogStatusFilter,
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
  status: AuditLogStatusFilter;
  canExport: boolean;
}

function formatCount(value: number, locale: string) {
  return new Intl.NumberFormat(locale).format(value);
}

function InsightMetric({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone: 'default' | 'warm' | 'success' | 'info';
}) {
  const toneClasses =
    tone === 'warm'
      ? 'border-dynamic-orange/25 bg-dynamic-orange/8 text-dynamic-orange'
      : tone === 'success'
        ? 'border-dynamic-green/25 bg-dynamic-green/8 text-dynamic-green'
        : tone === 'info'
          ? 'border-dynamic-blue/25 bg-dynamic-blue/8 text-dynamic-blue'
          : 'border-border/60 bg-background/80 text-foreground';

  return (
    <div className={`rounded-2xl border p-4 ${toneClasses}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm/6">{label}</p>
        <Icon className="h-4 w-4" />
      </div>
      <p className="mt-3 font-semibold text-3xl tracking-tight">{value}</p>
    </div>
  );
}

export function AuditLogInsights({
  wsId,
  locale,
  selectedPeriod,
  selectedValue,
  timeOptions,
  summary,
  chartStats,
  status,
  canExport,
}: Props) {
  const t = useTranslations('audit-log-insights');
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const selectedTimeOption =
    timeOptions.find((option) => option.value === selectedValue) ||
    timeOptions[0];
  const maxChartCount = Math.max(
    ...chartStats.map((stat) => stat.totalCount),
    1
  );
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
  const topUserText = summary.topUserName
    ? `${summary.topUserName} (${formatCount(summary.topUserCount, locale)})`
    : t('top_user_empty');

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

  const activityTitle =
    selectedPeriod === 'yearly'
      ? t('activity_title_yearly')
      : t('activity_title_monthly');
  const activityDescription =
    selectedPeriod === 'yearly'
      ? t('activity_description_yearly')
      : t('activity_description_monthly');
  const emptyStateMessage =
    selectedPeriod === 'yearly'
      ? t('no_activity_yearly')
      : t('no_activity_monthly');
  const timeLabel =
    selectedPeriod === 'yearly' ? t('year_label') : t('month_label');
  const chartBarWidthClass =
    selectedPeriod === 'yearly' ? 'max-w-7' : 'max-w-4';

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
              {selectedTimeOption && (
                <Badge variant="outline" className="rounded-full px-3 py-1">
                  {selectedTimeOption.label}
                </Badge>
              )}
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
            <div className="grid gap-3 text-sm md:grid-cols-3">
              <div className="rounded-2xl border border-border/60 bg-background/80 p-3">
                <p className="text-muted-foreground">
                  {t('peak_bucket_label')}
                </p>
                <p className="mt-1 font-medium">{peakBucketText}</p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-background/80 p-3">
                <p className="text-muted-foreground">{t('top_actor_label')}</p>
                <p className="mt-1 font-medium">{topActorText}</p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-background/80 p-3">
                <p className="text-muted-foreground">{t('top_user_label')}</p>
                <p className="mt-1 font-medium">{topUserText}</p>
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
                {timeLabel}
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

            {canExport && (
              <Dialog>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-11 justify-between rounded-xl border-dashed"
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
                    status={status}
                  />
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 p-6">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <InsightMetric
            icon={BarChart3}
            label={t('total_changes')}
            value={formatCount(summary.totalChanges, locale)}
            tone="default"
          />
          <InsightMetric
            icon={Users}
            label={t('users_affected')}
            value={formatCount(summary.affectedUsersCount, locale)}
            tone="info"
          />
          <InsightMetric
            icon={Archive}
            label={t('archived_actions')}
            value={formatCount(summary.archivedCount, locale)}
            tone="warm"
          />
          <InsightMetric
            icon={Activity}
            label={t('reactivated_actions')}
            value={formatCount(summary.activeCount, locale)}
            tone="success"
          />
        </div>

        <div className="rounded-3xl border border-border/60 bg-muted/20 p-5">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-semibold text-base">{activityTitle}</h3>
              <p className="text-muted-foreground text-sm">
                {activityDescription}
              </p>
            </div>
            <div className="flex items-center gap-4 text-muted-foreground text-xs">
              <span className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-dynamic-orange" />
                {t('archived_actions')}
              </span>
              <span className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-dynamic-green" />
                {t('reactivated_actions')}
              </span>
            </div>
          </div>

          {summary.totalChanges === 0 ? (
            <div className="flex min-h-52 flex-col items-center justify-center gap-3 text-center">
              <CalendarRange className="h-10 w-10 text-muted-foreground/50" />
              <p className="text-muted-foreground text-sm">
                {emptyStateMessage}
              </p>
            </div>
          ) : (
            <div className="mt-6">
              <div className="flex h-56 items-end gap-1.5">
                {chartStats.map((stat) => {
                  const totalHeight =
                    stat.totalCount === 0
                      ? 0
                      : Math.max((stat.totalCount / maxChartCount) * 100, 8);
                  const archivedHeight =
                    stat.totalCount === 0
                      ? 0
                      : (stat.archivedCount / stat.totalCount) * totalHeight;
                  const activeHeight =
                    stat.totalCount === 0
                      ? 0
                      : (stat.activeCount / stat.totalCount) * totalHeight;

                  return (
                    <Tooltip key={stat.key}>
                      <TooltipTrigger asChild>
                        <div className="group flex min-w-0 flex-1 flex-col items-center gap-2">
                          <div className="flex h-44 w-full items-end justify-center">
                            <div
                              className={`flex h-full w-full ${chartBarWidthClass} flex-col justify-end overflow-hidden rounded-full bg-muted`}
                            >
                              {stat.activeCount > 0 && (
                                <div
                                  className="w-full bg-dynamic-green/80 transition-opacity group-hover:opacity-90"
                                  style={{ height: `${activeHeight}%` }}
                                />
                              )}
                              {stat.archivedCount > 0 && (
                                <div
                                  className="w-full bg-dynamic-orange/80 transition-opacity group-hover:opacity-90"
                                  style={{ height: `${archivedHeight}%` }}
                                />
                              )}
                            </div>
                          </div>
                          <span className="text-[10px] text-muted-foreground">
                            {stat.label}
                          </span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className="rounded-xl px-3 py-2 text-xs shadow-lg">
                        <div className="space-y-2">
                          <p className="font-medium text-foreground">
                            {stat.tooltipLabel}
                          </p>
                          <div className="space-y-1 text-muted-foreground">
                            <div className="flex items-center justify-between gap-4">
                              <span>{t('total_changes')}</span>
                              <span className="font-medium text-foreground">
                                {formatCount(stat.totalCount, locale)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                              <span>{t('archived_actions')}</span>
                              <span className="font-medium text-dynamic-orange">
                                {formatCount(stat.archivedCount, locale)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                              <span>{t('reactivated_actions')}</span>
                              <span className="font-medium text-dynamic-green">
                                {formatCount(stat.activeCount, locale)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
