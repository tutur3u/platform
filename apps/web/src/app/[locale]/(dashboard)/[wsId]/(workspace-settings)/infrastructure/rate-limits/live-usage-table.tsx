'use client';

import { useQuery } from '@tanstack/react-query';
import { Activity, Loader2 } from '@tuturuuu/icons';
import {
  getRateLimitLiveUsage,
  type RateLimitEdgeBucket,
} from '@tuturuuu/internal-api';
import { useTranslations } from 'next-intl';

function formatWindow(seconds: number) {
  if (seconds <= 60) return '1m';
  if (seconds <= 3600) return '1h';
  return '1d';
}

function formatBucketSummary(bucket: RateLimitEdgeBucket) {
  return [
    bucket.policy,
    bucket.callerClass,
    bucket.operation,
    bucket.window,
    bucket.trustSuffix,
  ]
    .filter(Boolean)
    .join(':');
}

function EdgeBucketGroup({
  buckets,
  title,
}: {
  buckets: RateLimitEdgeBucket[];
  title: string;
}) {
  const t = useTranslations('rate-limits');

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium text-sm">{title}</p>
        <span className="text-muted-foreground text-xs">
          {t('live.edge_count', { count: buckets.length })}
        </span>
      </div>
      <div className="max-h-40 space-y-2 overflow-y-auto">
        {buckets.slice(0, 20).map((bucket) => (
          <div
            className="space-y-1 rounded-md bg-muted/40 p-2"
            key={bucket.key}
          >
            <div className="truncate font-mono text-xs">
              {formatBucketSummary(bucket) || t('live.unknown')}
            </div>
            <div className="truncate text-muted-foreground text-xs">
              {t('live.edge_subject', {
                subject: bucket.subjectKind ?? t('live.unknown'),
              })}
            </div>
          </div>
        ))}
        {buckets.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t('live.edge_empty')}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function LiveUsageTable() {
  const t = useTranslations('rate-limits');
  const usageQuery = useQuery({
    queryFn: () => getRateLimitLiveUsage(),
    queryKey: ['infrastructure', 'rate-limits', 'live-usage'],
    refetchInterval: 10000,
  });

  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-semibold text-xl">{t('live.title')}</h2>
        <p className="text-muted-foreground text-sm">{t('live.description')}</p>
      </div>

      {usageQuery.isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : null}

      {usageQuery.data ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,360px)]">
          <div className="overflow-hidden rounded-lg border border-border">
            <div className="flex items-center gap-2 border-border border-b bg-muted/50 p-3">
              <Activity className="h-4 w-4 text-primary" />
              <span className="font-medium text-sm">
                {t('live.write_title')}
              </span>
            </div>
            {usageQuery.data.writeCounters.length === 0 ? (
              <p className="p-4 text-muted-foreground text-sm">
                {t('live.write_empty')}
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="p-3 font-medium">{t('live.bucket')}</th>
                    <th className="p-3 font-medium">{t('live.window')}</th>
                    <th className="p-3 text-right font-medium">
                      {t('live.count')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {usageQuery.data.writeCounters.map((counter) => (
                    <tr
                      className="border-border border-t"
                      key={`${counter.bucket}:${counter.window_seconds}:${counter.window_started_at}`}
                    >
                      <td className="max-w-72 truncate p-3 font-mono text-xs">
                        {counter.bucket}
                      </td>
                      <td className="p-3 text-muted-foreground text-xs">
                        {formatWindow(counter.window_seconds)}
                      </td>
                      <td className="p-3 text-right font-semibold">
                        {counter.current_count.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="space-y-4 rounded-lg border border-border p-4">
            {usageQuery.data.readBuckets.available ? (
              <>
                <p className="text-muted-foreground text-sm">
                  {t('live.edge_active', {
                    count:
                      usageQuery.data.readBuckets.buckets.length +
                      usageQuery.data.mutateBuckets.buckets.length,
                  })}
                </p>
                <EdgeBucketGroup
                  buckets={usageQuery.data.readBuckets.buckets}
                  title={t('live.read_title')}
                />
                <EdgeBucketGroup
                  buckets={usageQuery.data.mutateBuckets.buckets}
                  title={t('live.mutate_title')}
                />
              </>
            ) : (
              <p className="text-muted-foreground text-sm">
                {t('live.read_unavailable')}
              </p>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
