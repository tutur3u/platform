'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Activity, Clock3, Coins, Cpu, DollarSign } from '@tuturuuu/icons';
import {
  type AiStudioRunsResponse,
  type AiStudioUsageRow,
  getAiStudioCredits,
  getAiStudioRuns,
  getAiStudioUsage,
} from '@tuturuuu/internal-api/ai-studio';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

type Preset = 'month' | '7' | '30' | '90' | 'custom';

export function ObservabilityPanel({
  section,
  workspaceId,
}: {
  section: 'credits' | 'logs' | 'runs' | 'usage';
  workspaceId: string;
}) {
  const t = useTranslations('ai-studio.observability');
  const [preset, setPreset] = useState<Preset>('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [status, setStatus] = useState('all');
  const [model, setModel] = useState('');
  const [feature, setFeature] = useState('');
  const range = useMemo(
    () => resolveRange(preset, customFrom, customTo),
    [customFrom, customTo, preset]
  );
  const usageQuery = useQuery({
    enabled: Boolean(range),
    queryFn: () => getAiStudioUsage(workspaceId, range!),
    queryKey: ['ai-studio-usage', workspaceId, range],
  });
  const creditsQuery = useQuery({
    enabled: section === 'credits',
    queryFn: () => getAiStudioCredits(workspaceId),
    queryKey: ['ai-studio-credits', workspaceId],
  });
  const runsQuery = useInfiniteQuery({
    enabled: Boolean(range) && (section === 'runs' || section === 'logs'),
    getNextPageParam: (lastPage: AiStudioRunsResponse) =>
      lastPage.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      getAiStudioRuns(workspaceId, {
        cursor: pageParam,
        from: range!.from,
        feature: feature || undefined,
        limit: 50,
        model: model || undefined,
        status: status === 'all' ? undefined : status,
        to: range!.to,
      }),
    queryKey: ['ai-studio-runs', workspaceId, range, status, model, feature],
  });

  const usage = usageQuery.data;
  const runs =
    (runsQuery.data?.pages as AiStudioRunsResponse[] | undefined)?.flatMap(
      (page) => page.runs
    ) ?? [];
  const statusOptions = [
    { label: t('status_all'), value: 'all' },
    { label: t('status_succeeded'), value: 'succeeded' },
    { label: t('status_failed'), value: 'failed' },
    { label: t('status_aborted'), value: 'aborted' },
    { label: t('status_running'), value: 'running' },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
          <Select
            onValueChange={(value) => setPreset(value as Preset)}
            value={preset}
          >
            <SelectTrigger className="w-full md:w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="month">{t('current_month')}</SelectItem>
              <SelectItem value="7">{t('last_days', { days: 7 })}</SelectItem>
              <SelectItem value="30">{t('last_days', { days: 30 })}</SelectItem>
              <SelectItem value="90">{t('last_days', { days: 90 })}</SelectItem>
              <SelectItem value="custom">{t('custom')}</SelectItem>
            </SelectContent>
          </Select>
          {preset === 'custom' ? (
            <>
              <Input
                onChange={(event) => setCustomFrom(event.target.value)}
                type="date"
                value={customFrom}
              />
              <Input
                onChange={(event) => setCustomTo(event.target.value)}
                type="date"
                value={customTo}
              />
            </>
          ) : null}
          {section === 'runs' || section === 'logs' ? (
            <>
              <Input
                className="w-full md:ml-auto md:w-52"
                onChange={(event) => setModel(event.target.value)}
                placeholder={t('model')}
                value={model}
              />
              <Input
                className="w-full md:w-52"
                onChange={(event) => setFeature(event.target.value)}
                placeholder={t('feature')}
                value={feature}
              />
              <Select onValueChange={setStatus} value={status}>
                <SelectTrigger className="w-full md:w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          ) : null}
        </CardContent>
      </Card>

      <UsageMetrics
        credits={creditsQuery.data}
        isLoading={usageQuery.isPending}
        totals={usage?.totals}
      />

      {section === 'runs' || section === 'logs' ? (
        <RunsTable
          isLoading={runsQuery.isPending}
          onLoadMore={() => runsQuery.fetchNextPage()}
          runs={runs}
          showLoadMore={Boolean(runsQuery.hasNextPage)}
        />
      ) : (
        <UsageBreakdowns rows={usage?.rows ?? []} />
      )}
    </div>
  );
}

function UsageMetrics({
  credits,
  isLoading,
  totals,
}: {
  credits?: { remaining: number; totalUsed: number };
  isLoading: boolean;
  totals?: {
    averageLatencyMs: number;
    billedCredits: number;
    inputTokens: number;
    outputTokens: number;
    providerCostUsd: number;
    reasoningTokens: number;
    requestCount: number;
    succeededCount: number;
    failedCount: number;
    abortedCount: number;
    embeddingUnits: number;
    imageUnits: number;
  };
}) {
  const t = useTranslations('ai-studio.observability');
  const metrics = [
    { icon: Activity, label: t('requests'), value: totals?.requestCount },
    { icon: Coins, label: t('billed_credits'), value: totals?.billedCredits },
    {
      icon: DollarSign,
      label: t('provider_cost'),
      value:
        totals &&
        `$${totals.providerCostUsd.toLocaleString(undefined, {
          maximumFractionDigits: 6,
        })}`,
    },
    {
      icon: Cpu,
      label: t('tokens'),
      value:
        totals &&
        totals.inputTokens + totals.outputTokens + totals.reasoningTokens,
    },
    {
      icon: Cpu,
      label: t('media_units'),
      value: totals && totals.embeddingUnits + totals.imageUnits,
    },
    {
      icon: Clock3,
      label: t('average_latency'),
      value: totals && `${Math.round(totals.averageLatencyMs)} ms`,
    },
    {
      icon: Activity,
      label: t('status_succeeded'),
      value: totals?.succeededCount,
    },
    { icon: Activity, label: t('status_failed'), value: totals?.failedCount },
    { icon: Activity, label: t('status_aborted'), value: totals?.abortedCount },
    ...(credits
      ? [
          {
            icon: Coins,
            label: t('remaining_credits'),
            value: credits.remaining,
          },
        ]
      : []),
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {metrics.map(({ icon: Icon, label, value }) => (
        <Card key={label}>
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardTitle className="font-medium text-muted-foreground text-sm">
              {label}
            </CardTitle>
            <Icon className="size-4 text-primary" />
          </CardHeader>
          <CardContent className="font-semibold text-2xl tabular-nums">
            {isLoading || value === undefined
              ? '—'
              : typeof value === 'number'
                ? value.toLocaleString(undefined, { maximumFractionDigits: 4 })
                : value}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function UsageBreakdowns({ rows }: { rows: AiStudioUsageRow[] }) {
  const t = useTranslations('ai-studio.observability');
  const modelRows = aggregateBy(rows, (row) => row.modelId);
  const featureRows = aggregateBy(rows, (row) => row.feature);
  const dayRows = aggregateBy(rows, (row) => row.bucketDate);
  const sourceRows = aggregateBy(rows, (row) =>
    row.sourceType === 'api_key'
      ? t('source_api_key')
      : row.sourceType === 'external_app'
        ? t('source_external_app')
        : t('source_session')
  );
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <BreakdownTable rows={modelRows} title={t('by_model')} />
      <BreakdownTable rows={featureRows} title={t('by_feature')} />
      <BreakdownTable rows={sourceRows} title={t('by_source')} />
      <div className="xl:col-span-2">
        <BreakdownTable rows={dayRows} title={t('daily_usage')} />
      </div>
    </div>
  );
}

function BreakdownTable({
  rows,
  title,
}: {
  rows: ReturnType<typeof aggregateBy>;
  title: string;
}) {
  const t = useTranslations('ai-studio.observability');
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b text-muted-foreground">
            <tr>
              <th className="p-3 text-left font-medium">{t('dimension')}</th>
              <th className="p-3 text-right font-medium">{t('requests')}</th>
              <th className="p-3 text-right font-medium">
                {t('billed_credits')}
              </th>
              <th className="p-3 text-right font-medium">
                {t('provider_cost')}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr className="border-b last:border-0" key={row.label}>
                <td className="p-3">{row.label}</td>
                <td className="p-3 text-right">
                  {row.requests.toLocaleString()}
                </td>
                <td className="p-3 text-right">{row.credits.toFixed(4)}</td>
                <td className="p-3 text-right">${row.cost.toFixed(6)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <EmptyState /> : null}
      </CardContent>
    </Card>
  );
}

function RunsTable({
  isLoading,
  onLoadMore,
  runs,
  showLoadMore,
}: {
  isLoading: boolean;
  onLoadMore: () => void;
  runs: Awaited<ReturnType<typeof getAiStudioRuns>>['runs'];
  showLoadMore: boolean;
}) {
  const t = useTranslations('ai-studio.observability');
  return (
    <Card>
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full min-w-[68rem] text-sm">
          <thead className="border-b text-muted-foreground">
            <tr>
              <th className="p-3 text-left font-medium">{t('request')}</th>
              <th className="p-3 text-left font-medium">{t('model')}</th>
              <th className="p-3 text-left font-medium">{t('feature')}</th>
              <th className="p-3 text-left font-medium">{t('source')}</th>
              <th className="p-3 text-left font-medium">{t('status')}</th>
              <th className="p-3 text-left font-medium">{t('tokens')}</th>
              <th className="p-3 text-left font-medium">{t('media_units')}</th>
              <th className="p-3 text-left font-medium">
                {t('billed_credits')}
              </th>
              <th className="p-3 text-left font-medium">
                {t('provider_cost')}
              </th>
              <th className="p-3 text-left font-medium">{t('latency')}</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr className="border-b last:border-0" key={run.id}>
                <td className="max-w-52 truncate p-3 font-mono text-xs">
                  {run.requestId}
                </td>
                <td className="p-3">{run.modelId}</td>
                <td className="p-3">{run.feature}</td>
                <td className="p-3">
                  {run.sourceType === 'api_key'
                    ? t('source_api_key')
                    : run.sourceType === 'external_app'
                      ? t('source_external_app')
                      : t('source_session')}
                </td>
                <td className="p-3">
                  <Badge variant="outline">{run.status}</Badge>
                </td>
                <td className="p-3">
                  {(
                    run.inputTokens +
                    run.outputTokens +
                    run.reasoningTokens
                  ).toLocaleString()}
                </td>
                <td className="p-3">
                  {(run.embeddingUnits + run.imageUnits).toLocaleString()}
                </td>
                <td className="p-3">{run.billedCredits.toFixed(4)}</td>
                <td className="p-3">${run.providerCostUsd.toFixed(6)}</td>
                <td className="p-3">
                  {run.latencyMs === null ? '—' : `${run.latencyMs} ms`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!isLoading && runs.length === 0 ? <EmptyState /> : null}
        {showLoadMore ? (
          <div className="flex justify-center border-t p-4">
            <Button onClick={onLoadMore} variant="outline">
              {t('load_more')}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  const t = useTranslations('ai-studio.observability');
  return (
    <div className="p-10 text-center text-muted-foreground text-sm">
      {t('empty')}
    </div>
  );
}

function aggregateBy(
  rows: AiStudioUsageRow[],
  label: (row: AiStudioUsageRow) => string
) {
  const values = new Map<
    string,
    { cost: number; credits: number; requests: number }
  >();
  for (const row of rows) {
    const key = label(row);
    const current = values.get(key) ?? { cost: 0, credits: 0, requests: 0 };
    current.cost += row.providerCostUsd;
    current.credits += row.billedCredits;
    current.requests += row.requestCount;
    values.set(key, current);
  }
  return [...values.entries()]
    .map(([entryLabel, value]) => ({ label: entryLabel, ...value }))
    .sort((a, b) => b.cost - a.cost);
}

function resolveRange(preset: Preset, customFrom: string, customTo: string) {
  const now = new Date();
  if (preset === 'custom') {
    if (!customFrom || !customTo) return null;
    const from = new Date(`${customFrom}T00:00:00.000Z`);
    const to = new Date(`${customTo}T23:59:59.999Z`);
    if (to <= from || to.getTime() - from.getTime() > 366 * 86_400_000) {
      return null;
    }
    return { from: from.toISOString(), to: to.toISOString() };
  }
  const from =
    preset === 'month'
      ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
      : new Date(now.getTime() - Number(preset) * 86_400_000);
  return { from: from.toISOString(), to: now.toISOString() };
}
