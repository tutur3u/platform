'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { AlertCircle, RefreshCw } from '@tuturuuu/icons';
import {
  type AiStudioRunsResponse,
  getAiStudioCredits,
  getAiStudioRuns,
  getAiStudioUsage,
} from '@tuturuuu/internal-api/ai-studio';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
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
import { ObservabilityBreakdowns } from './observability-breakdowns';
import {
  type ObservabilityPreset,
  resolveObservabilityRange,
} from './observability-helpers';
import { ObservabilityRuns } from './observability-runs';
import { ObservabilitySummary } from './observability-summary';

type ObservabilitySection = 'credits' | 'logs' | 'runs' | 'usage';

export function ObservabilityPanel({
  section,
  workspaceId,
}: {
  section: ObservabilitySection;
  workspaceId: string;
}) {
  const t = useTranslations('ai-studio.observability');
  const [preset, setPreset] = useState<ObservabilityPreset>('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [status, setStatus] = useState('all');
  const [model, setModel] = useState('');
  const [feature, setFeature] = useState('');
  const range = useMemo(
    () => resolveObservabilityRange(preset, customFrom, customTo),
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
        feature: feature || undefined,
        from: range!.from,
        limit: 50,
        model: model || undefined,
        status: status === 'all' ? undefined : status,
        to: range!.to,
      }),
    queryKey: ['ai-studio-runs', workspaceId, range, status, model, feature],
  });
  const runs = runsQuery.data?.pages.flatMap((page) => page.runs) ?? [];
  const isRunSection = section === 'runs' || section === 'logs';
  const hasError =
    usageQuery.isError ||
    (section === 'credits' && creditsQuery.isError) ||
    (isRunSection && runsQuery.isError);
  const refresh = () => {
    void usageQuery.refetch();
    if (section === 'credits') void creditsQuery.refetch();
    if (isRunSection) void runsQuery.refetch();
  };

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="font-medium">{t('coverage_title')}</p>
              <p className="max-w-3xl text-muted-foreground text-sm">
                {t('coverage_description')}
              </p>
            </div>
            <Button
              disabled={usageQuery.isFetching || runsQuery.isFetching}
              onClick={refresh}
              size="sm"
              variant="outline"
            >
              <RefreshCw
                className={`mr-2 size-4 ${
                  usageQuery.isFetching || runsQuery.isFetching
                    ? 'animate-spin'
                    : ''
                }`}
              />
              {t('refresh')}
            </Button>
          </div>
          <Filters
            customFrom={customFrom}
            customTo={customTo}
            feature={feature}
            isRunSection={isRunSection}
            model={model}
            preset={preset}
            setCustomFrom={setCustomFrom}
            setCustomTo={setCustomTo}
            setFeature={setFeature}
            setModel={setModel}
            setPreset={setPreset}
            setStatus={setStatus}
            status={status}
          />
          {preset === 'custom' && !range ? (
            <p className="text-dynamic-red text-sm">
              {t('invalid_custom_range')}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {hasError ? <ErrorState onRetry={refresh} /> : null}
      <ObservabilitySummary
        credits={creditsQuery.data}
        isLoading={
          usageQuery.isPending ||
          (section === 'credits' && creditsQuery.isPending)
        }
        section={section}
        totals={usageQuery.data?.totals}
      />
      {isRunSection ? (
        <ObservabilityRuns
          isFetchingMore={runsQuery.isFetchingNextPage}
          isLoading={runsQuery.isPending}
          onLoadMore={() => void runsQuery.fetchNextPage()}
          runs={runs}
          showLoadMore={Boolean(runsQuery.hasNextPage)}
        />
      ) : (
        <ObservabilityBreakdowns
          isLoading={usageQuery.isPending}
          rows={usageQuery.data?.rows ?? []}
        />
      )}
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations('ai-studio.observability');
  return (
    <Card className="border-dynamic-red/30">
      <CardContent className="flex items-start gap-3 p-4">
        <AlertCircle className="mt-0.5 size-5 shrink-0 text-dynamic-red" />
        <div className="flex-1">
          <p className="font-medium">{t('error_title')}</p>
          <p className="text-muted-foreground text-sm">
            {t('error_description')}
          </p>
        </div>
        <Button onClick={onRetry} size="sm" variant="outline">
          {t('retry')}
        </Button>
      </CardContent>
    </Card>
  );
}

function Filters(props: FilterProps) {
  const t = useTranslations('ai-studio.observability');
  return (
    <div className="flex flex-col gap-3 border-t pt-4 md:flex-row md:items-center">
      <Select
        onValueChange={(value) => props.setPreset(value as ObservabilityPreset)}
        value={props.preset}
      >
        <SelectTrigger className="w-full md:w-52">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="month">{t('current_month')}</SelectItem>
          {[7, 30, 90].map((days) => (
            <SelectItem key={days} value={String(days)}>
              {t('last_days', { days })}
            </SelectItem>
          ))}
          <SelectItem value="custom">{t('custom')}</SelectItem>
        </SelectContent>
      </Select>
      {props.preset === 'custom' ? (
        <>
          <Input
            aria-label={t('from_date')}
            onChange={(event) => props.setCustomFrom(event.target.value)}
            type="date"
            value={props.customFrom}
          />
          <Input
            aria-label={t('to_date')}
            onChange={(event) => props.setCustomTo(event.target.value)}
            type="date"
            value={props.customTo}
          />
        </>
      ) : null}
      {props.isRunSection ? <RunFilters {...props} /> : null}
    </div>
  );
}

function RunFilters(props: FilterProps) {
  const t = useTranslations('ai-studio.observability');
  return (
    <>
      <Input
        className="w-full md:ml-auto md:w-48"
        onChange={(event) => props.setModel(event.target.value)}
        placeholder={t('model')}
        value={props.model}
      />
      <Input
        className="w-full md:w-48"
        onChange={(event) => props.setFeature(event.target.value)}
        placeholder={t('feature')}
        value={props.feature}
      />
      <Select onValueChange={props.setStatus} value={props.status}>
        <SelectTrigger className="w-full md:w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {['all', 'succeeded', 'failed', 'aborted', 'running'].map((value) => (
            <SelectItem key={value} value={value}>
              {t(`status_${value}` as Parameters<typeof t>[0])}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}

interface FilterProps {
  customFrom: string;
  customTo: string;
  feature: string;
  isRunSection: boolean;
  model: string;
  preset: ObservabilityPreset;
  setCustomFrom: (value: string) => void;
  setCustomTo: (value: string) => void;
  setFeature: (value: string) => void;
  setModel: (value: string) => void;
  setPreset: (value: ObservabilityPreset) => void;
  setStatus: (value: string) => void;
  status: string;
}
