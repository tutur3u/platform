'use client';
import type {
  PeriodicReportCounts,
  PeriodicReportStage,
} from '@tuturuuu/internal-api/reports';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import {
  getPeriodicStageAppearance,
  PERIODIC_STAGES,
} from './periodic-stage-meta';

export { PERIODIC_STAGES } from './periodic-stage-meta';

const PIPELINE = ['approved', 'queued', 'sent', 'blocked'] as const;

export function PeriodicStatusSummary({
  counts,
  stage,
  onChange,
  toolbar,
}: {
  counts?: PeriodicReportCounts;
  stage: PeriodicReportStage | 'all';
  onChange: (stage: PeriodicReportStage | 'all') => void;
  toolbar?: ReactNode;
}) {
  const t = useTranslations('reports-hub');
  return (
    <section
      aria-label={t('report_status')}
      className="min-w-0 overflow-hidden rounded-xl border bg-background"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <h2 className="font-semibold text-base">{t('delivery_overview')}</h2>
          <p className="text-muted-foreground text-xs">
            {t('pipeline_scope_note')}
          </p>
        </div>
        <Button
          variant={stage === 'all' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => onChange('all')}
        >
          {t('total_reports')}{' '}
          <span className="font-semibold tabular-nums">
            {counts?.total?.toLocaleString() ?? '—'}
          </span>
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2 p-3 md:grid-cols-4">
        {PIPELINE.map((value) => {
          const appearance = getPeriodicStageAppearance(value);
          const Icon = appearance.icon;
          const label = PERIODIC_STAGES.find(([key]) => key === value)![1];
          return (
            <button
              key={value}
              type="button"
              aria-pressed={stage === value}
              onClick={() => onChange(value)}
              className={cn(
                'rounded-lg border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                stage === value
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-muted/10 hover:bg-muted/30'
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground text-xs">
                  {t(label)}
                </span>
                <Icon className="size-4 text-muted-foreground" />
              </div>
              <p className="mt-2 font-semibold text-2xl tabular-nums tracking-tight">
                {counts?.stages?.[value]?.toLocaleString() ?? '—'}
              </p>
              <p className="mt-1 text-muted-foreground text-xs">
                {t(`pipeline_${value}_hint`)}
              </p>
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-1 px-3 pb-3">
        {PERIODIC_STAGES.filter(
          ([key]) => !PIPELINE.some((value) => value === key)
        ).map(([key, label]) => (
          <Button
            key={key}
            size="sm"
            variant={stage === key ? 'secondary' : 'ghost'}
            aria-pressed={stage === key}
            className="h-8 text-xs"
            onClick={() => onChange(key)}
          >
            {t(label)}{' '}
            <span className="tabular-nums">{counts?.stages?.[key] ?? '—'}</span>
          </Button>
        ))}
      </div>
      {toolbar && <div className="border-t p-3 md:p-4">{toolbar}</div>}
    </section>
  );
}
