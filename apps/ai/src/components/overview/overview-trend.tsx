'use client';

import { useTranslations } from 'next-intl';
import type { AiStudioOverviewDay } from '@/lib/studio-data';
import { MeasureTrendChart } from '../studio/measure-trend-chart';

export function OverviewTrend({ daily }: { daily: AiStudioOverviewDay[] }) {
  const t = useTranslations('ai-studio.home');

  return (
    <MeasureTrendChart
      data={daily}
      description={t('trend_description')}
      emptyDescription={t('trend_empty_description')}
      emptyTitle={t('trend_empty')}
      measureLabels={{
        cost: t('measure_cost'),
        credits: t('measure_credits'),
        requests: t('measure_requests'),
      }}
      title={t('trend_title')}
    />
  );
}
