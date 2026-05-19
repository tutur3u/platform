'use client';

import { Radio } from '@tuturuuu/icons';
import type {
  ObservabilityResourceSampling,
  ObservabilityResourceSamplingStatus,
  ObservabilityResources,
} from '@tuturuuu/internal-api/infrastructure';
import { Badge } from '@tuturuuu/ui/badge';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { formatDateTime } from './formatters';
import {
  getSamplingResourceTone,
  resourceToneClasses,
} from './observability-resource-theme';

const samplingStatusLabelKeys: Record<
  ObservabilityResourceSamplingStatus,
  | 'resources.sampling_status_gapped'
  | 'resources.sampling_status_healthy'
  | 'resources.sampling_status_live-only'
  | 'resources.sampling_status_stale'
> = {
  gapped: 'resources.sampling_status_gapped',
  healthy: 'resources.sampling_status_healthy',
  'live-only': 'resources.sampling_status_live-only',
  stale: 'resources.sampling_status_stale',
};

function formatAge(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) {
    return '—';
  }

  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000],
    ['second', 1000],
  ];

  for (const [unit, size] of units) {
    if (value >= size || unit === 'second') {
      return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(
        -Math.round(value / size),
        unit
      );
    }
  }

  return '—';
}

function SamplingStatusCard({
  label,
  sampling,
}: {
  label: string;
  sampling: ObservabilityResourceSampling | undefined;
}) {
  const t = useTranslations('blue-green-monitoring.observability');
  const status = sampling?.status ?? 'live-only';
  const tone = getSamplingResourceTone(status);
  const latest = sampling?.latestSampleAt
    ? formatAge(sampling.latestSampleAgeMs)
    : t('resources.sampling_latest_none');

  return (
    <div className="rounded-md border border-border/70 bg-muted/20 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-sm">{label}</p>
          <p className="mt-1 text-muted-foreground text-xs">
            {sampling?.latestSampleAt
              ? t('resources.sampling_latest_at', {
                  age: latest,
                  time: formatDateTime(sampling.latestSampleAt),
                })
              : latest}
          </p>
        </div>
        <Badge
          className={cn(
            'shrink-0 rounded-full border px-2 py-0.5 font-medium',
            resourceToneClasses[tone].soft,
            resourceToneClasses[tone].text
          )}
          variant="outline"
        >
          {t(samplingStatusLabelKeys[status])}
        </Badge>
      </div>
      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
        <span className="rounded border border-border/60 bg-background/70 px-2 py-1.5">
          {t('resources.sampling_coverage', {
            sampled: sampling?.sampledBucketCount ?? 0,
            total: sampling?.bucketCount ?? 0,
          })}
        </span>
        <span className="rounded border border-border/60 bg-background/70 px-2 py-1.5">
          {t('resources.sampling_gaps', {
            count: sampling?.gapBucketCount ?? 0,
          })}
        </span>
        <span className="rounded border border-border/60 bg-background/70 px-2 py-1.5">
          {t('resources.sampling_expected_interval', {
            minutes: Math.max(
              1,
              Math.round((sampling?.expectedIntervalMs ?? 60_000) / 60_000)
            ),
          })}
        </span>
      </div>
    </div>
  );
}

export function SamplingContinuityPanel({
  isLoading,
  sampling,
}: {
  isLoading: boolean;
  sampling: ObservabilityResources['sampling'] | undefined;
}) {
  const t = useTranslations('blue-green-monitoring.observability');

  return (
    <section className="rounded-lg border border-border bg-background p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase">
            <Radio className="h-4 w-4" />
            <span>{t('resources.sampling_signal')}</span>
          </div>
          <h2 className="mt-2 font-semibold text-lg">
            {t('resources.sampling_title')}
          </h2>
          <p className="mt-1 text-muted-foreground text-sm">
            {t('resources.sampling_meta')}
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-muted-foreground text-xs">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-dynamic-green/70" />
            {t('resources.sampling_strip_sampled')}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-dynamic-red/45" />
            {t('resources.sampling_strip_gap')}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-dynamic-blue/80" />
            {t('resources.sampling_strip_live')}
          </span>
        </div>
      </div>
      {isLoading ? (
        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          <div className="h-28 animate-pulse rounded-md border border-border/70 bg-muted/30" />
          <div className="h-28 animate-pulse rounded-md border border-border/70 bg-muted/30" />
        </div>
      ) : (
        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          <SamplingStatusCard
            label={t('resources.sampling_runtime')}
            sampling={sampling?.runtime}
          />
          <SamplingStatusCard
            label={t('resources.sampling_build')}
            sampling={sampling?.build}
          />
        </div>
      )}
    </section>
  );
}
