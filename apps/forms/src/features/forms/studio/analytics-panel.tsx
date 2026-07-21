'use client';

import {
  BarChart3,
  Clock,
  Eye,
  Globe,
  Laptop,
  MapPin,
  Monitor,
  RefreshCcw,
  Smartphone,
  Trash,
  TrendingDown,
  Users,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Progress } from '@tuturuuu/ui/progress';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';

import { useClearFormAnalyticsMutation } from '../hooks';
import type { FormAnalytics } from '../types';
import { renderEngagementCard } from './analytics-activity-chart';
import { BreakdownCard, DistributionCard, StatCard } from './analytics-cards';
import {
  renderDropoffQuestionCard,
  renderDropoffSectionCard,
} from './analytics-dropoff-cards';
import { formatDuration, formatPercent } from './analytics-format';
import { DestructiveActionDialog } from './destructive-action-dialog';

export function AnalyticsPanel({
  wsId,
  formId,
  analytics,
  onRefresh,
  isRefreshing = false,
}: {
  wsId: string;
  formId?: string;
  analytics: FormAnalytics;
  onRefresh: () => void;
  isRefreshing?: boolean;
}) {
  const t = useTranslations('forms');
  const tCommon = useTranslations('common');
  const clearMutation = useClearFormAnalyticsMutation({
    wsId,
    formId: formId ?? '',
  });

  const maxDropoffSection = Math.max(
    ...analytics.dropoffBySection.map((item) => item.count),
    1
  );
  const maxDropoffQuestion = Math.max(
    ...analytics.dropoffByQuestion
      .filter((item) => item.count > 0)
      .map((item) => item.count),
    1
  );
  const topReferrer = analytics.topReferrers[0];
  const topCountry = analytics.countries[0];
  const topCity = analytics.cities[0];
  const topDevice = analytics.devices[0];
  const topDropoffSection = analytics.dropoffBySection[0];
  const topDropoffQuestion = analytics.dropoffByQuestion.find(
    (item) => item.count > 0
  );
  const activityChartData = [...analytics.activity]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map((entry) => ({
      ...entry,
      shortDate: new Date(entry.date).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      }),
    }));
  const responderMix = analytics.responderModeBreakdown.filter(
    (item) => item.value > 0
  );
  const deviceMix = analytics.devices.filter((item) => item.value > 0);
  const funnelSteps = [
    {
      label: t('analytics.views'),
      value: analytics.totalViews,
      pct: 100,
    },
    {
      label: t('analytics.starts'),
      value: analytics.totalStarts,
      pct: analytics.startRate,
    },
    {
      label: t('analytics.submissions'),
      value: analytics.totalSubmissions,
      pct: analytics.completionRate,
    },
  ];
  const viewToStartLoss = Math.max(
    analytics.totalViews - analytics.totalStarts,
    0
  );
  const startToSubmitLoss = Math.max(
    analytics.totalStarts - analytics.totalSubmissions,
    0
  );

  const DeviceIcon = ({ type }: { type: string }) => {
    const lower = type.toLowerCase();
    if (lower === 'mobile') return <Smartphone className="h-3.5 w-3.5" />;
    return <Monitor className="h-3.5 w-3.5" />;
  };

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden border-border/60 bg-card/80 shadow-sm">
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="rounded-full px-3 py-1">
                  {t('analytics.title')}
                </Badge>
                <Badge variant="secondary" className="rounded-full px-3 py-1">
                  {analytics.totalViews} {t('analytics.views_short')}
                </Badge>
              </div>
              <div className="space-y-1">
                <h2 className="font-semibold text-2xl">
                  {t('analytics.title')}
                </h2>
                <p className="max-w-3xl text-muted-foreground text-sm">
                  {t('analytics.description')}
                </p>
              </div>
            </div>
            {formId ? (
              <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  disabled={isRefreshing}
                  onClick={onRefresh}
                  size="sm"
                  className={cn('w-full rounded-xl sm:w-auto')}
                >
                  <RefreshCcw
                    className={cn(
                      'mr-2 h-4 w-4',
                      isRefreshing && 'animate-spin'
                    )}
                  />
                  {tCommon('refresh')}
                </Button>
                <DestructiveActionDialog
                  actionLabel={
                    clearMutation.isPending
                      ? tCommon('deleting')
                      : t('analytics.clear_all')
                  }
                  cancelLabel={t('analytics.keep_analytics')}
                  description={t(
                    'analytics.clear_all_confirmation_description'
                  )}
                  isPending={clearMutation.isPending}
                  onConfirm={() => clearMutation.mutate()}
                  title={t('analytics.clear_all_confirmation_title')}
                  trigger={
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={clearMutation.isPending}
                      className="w-full rounded-xl text-destructive hover:text-destructive sm:w-auto"
                    >
                      <Trash className="mr-2 h-4 w-4" />
                      {t('analytics.clear_all')}
                    </Button>
                  }
                />
              </div>
            ) : null}
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-[1.35rem] border border-border/60 bg-background/50 px-4 py-3">
              <p className="text-[11px] text-muted-foreground uppercase tracking-[0.22em]">
                {t('analytics.strongest_signal')}
              </p>
              <p className="mt-2 truncate font-semibold text-base">
                {topReferrer?.label ?? t('analytics.no_data')}
              </p>
            </div>
            <div className="rounded-[1.35rem] border border-border/60 bg-background/50 px-4 py-3">
              <p className="text-[11px] text-muted-foreground uppercase tracking-[0.22em]">
                {t('analytics.top_location')}
              </p>
              <p className="mt-2 truncate font-semibold text-base">
                {topCountry?.label ?? topCity?.label ?? t('analytics.no_data')}
              </p>
            </div>
            <div className="rounded-[1.35rem] border border-border/60 bg-background/50 px-4 py-3">
              <p className="text-[11px] text-muted-foreground uppercase tracking-[0.22em]">
                {t('analytics.device_breakdown')}
              </p>
              <p className="mt-2 truncate font-semibold text-base">
                {topDevice?.label ?? t('analytics.no_data')}
              </p>
            </div>
            <div className="rounded-[1.35rem] border border-border/60 bg-background/50 px-4 py-3">
              <p className="text-[11px] text-muted-foreground uppercase tracking-[0.22em]">
                {t('analytics.biggest_dropoff')}
              </p>
              <p className="mt-2 truncate font-semibold text-base">
                {topDropoffQuestion?.title ??
                  topDropoffSection?.title ??
                  t('analytics.no_dropoff_data')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
        <StatCard
          label={t('analytics.views')}
          value={analytics.totalViews}
          icon={Eye}
        />
        <StatCard
          label={t('analytics.starts')}
          value={analytics.totalStarts}
          icon={Users}
          tone="green"
        />
        <StatCard
          label={t('analytics.submissions')}
          value={analytics.totalSubmissions}
          icon={BarChart3}
          tone="orange"
        />
        <StatCard
          label={t('analytics.dropoffs')}
          value={analytics.totalAbandons}
          icon={TrendingDown}
          tone="orange"
        />
        <StatCard
          label={t('analytics.start_rate')}
          value={formatPercent(analytics.startRate)}
          icon={Globe}
        />
        <StatCard
          label={t('analytics.completion_rate')}
          value={formatPercent(analytics.completionRate)}
          icon={TrendingDown}
          tone="green"
        />
        <StatCard
          label={t('analytics.avg_completion_time')}
          value={formatDuration(analytics.avgCompletionSeconds)}
          icon={Clock}
        />
      </div>

      <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        {renderEngagementCard({ t, analytics, activityChartData })}

        <Card className="overflow-hidden border-border/60 bg-card/80 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {t('analytics.conversion_story')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {funnelSteps.map(({ label, value, pct }) => (
              <div
                key={label}
                className="rounded-2xl border border-border/50 bg-background/45 px-4 py-3"
              >
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span>{label}</span>
                  <span className="font-medium">
                    {value}{' '}
                    <span className="text-muted-foreground text-xs">
                      ({formatPercent(pct)})
                    </span>
                  </span>
                </div>
                <Progress value={pct} className="mt-2 h-2.5" />
              </div>
            ))}
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-2xl border border-border/60 bg-background/50 px-4 py-3">
                <p className="text-[11px] text-muted-foreground uppercase tracking-[0.2em]">
                  {t('analytics.view_to_start_loss')}
                </p>
                <p className="mt-1 font-semibold text-lg">{viewToStartLoss}</p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-background/50 px-4 py-3">
                <p className="text-[11px] text-muted-foreground uppercase tracking-[0.2em]">
                  {t('analytics.start_to_submit_loss')}
                </p>
                <p className="mt-1 font-semibold text-lg">
                  {startToSubmitLoss}
                </p>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-2xl border border-border/60 bg-background/50 px-4 py-3">
                <p className="text-[11px] text-muted-foreground uppercase tracking-[0.2em]">
                  {t('analytics.unique_referrers')}
                </p>
                <p className="mt-1 font-semibold text-xl">
                  {analytics.uniqueReferrers}
                </p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-background/50 px-4 py-3">
                <p className="text-[11px] text-muted-foreground uppercase tracking-[0.2em]">
                  {t('analytics.unique_countries')}
                </p>
                <p className="mt-1 font-semibold text-xl">
                  {analytics.uniqueCountries}
                </p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-background/50 px-4 py-3">
                <p className="text-[11px] text-muted-foreground uppercase tracking-[0.2em]">
                  {t('analytics.completion_from_starts')}
                </p>
                <p className="mt-1 font-semibold text-xl">
                  {formatPercent(analytics.completionFromStartsRate)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid items-start gap-3 xl:grid-cols-2">
        <DistributionCard
          title={t('analytics.responder_modes')}
          items={responderMix}
          emptyLabel={t('analytics.no_data')}
        />
        <DistributionCard
          title={t('analytics.traffic_snapshot')}
          items={deviceMix}
          emptyLabel={t('analytics.no_data')}
        />
      </div>

      <div className="grid items-start gap-3 xl:grid-cols-2">
        {renderDropoffSectionCard({ t, analytics, maxDropoffSection })}

        {renderDropoffQuestionCard({ t, analytics, maxDropoffQuestion })}
      </div>

      <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
        <BreakdownCard
          title={t('analytics.top_referrers')}
          icon={Globe}
          items={analytics.topReferrers}
          emptyLabel={t('analytics.no_data')}
        />
        <BreakdownCard
          title={t('analytics.browsers')}
          icon={Laptop}
          items={analytics.browsers}
          emptyLabel={t('analytics.no_data')}
          tone="green"
        />
        <BreakdownCard
          title={t('analytics.operating_systems')}
          icon={Monitor}
          items={analytics.operatingSystems}
          emptyLabel={t('analytics.no_data')}
          tone="orange"
        />
        <BreakdownCard
          title={t('analytics.top_countries')}
          icon={MapPin}
          items={analytics.countries}
          emptyLabel={t('analytics.no_data')}
        />
        <BreakdownCard
          title={t('analytics.top_cities')}
          icon={MapPin}
          items={analytics.cities}
          emptyLabel={t('analytics.no_data')}
          tone="green"
        />
        <Card className="overflow-hidden border-border/60 bg-card/80 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {t('analytics.device_breakdown')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {analytics.devices.length === 0 ? (
              <div className="rounded-2xl border border-border/50 bg-background/50 px-4 py-5 text-muted-foreground text-sm">
                {t('analytics.no_data')}
              </div>
            ) : (
              analytics.devices.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between rounded-2xl border border-border/50 bg-background/45 px-4 py-3"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <DeviceIcon type={item.label} />
                    <span className="truncate text-sm">{item.label}</span>
                  </div>
                  <span className="shrink-0 font-medium text-sm">
                    {item.value}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
