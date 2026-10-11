'use client';
import type {
  PeriodicReportCounts,
  PeriodicReportStage,
} from '@tuturuuu/internal-api/reports';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import {
  getPeriodicStageAppearance,
  PERIODIC_STAGES,
} from './periodic-stage-meta';
import {
  ReportStatusCard,
  ReportStatusDashboard,
} from './report-status-dashboard';

export { PERIODIC_STAGES } from './periodic-stage-meta';

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
  const common = useTranslations('common');
  return (
    <ReportStatusDashboard
      total={counts?.total}
      totalLabel={t('total_reports')}
      label={t('report_status')}
      toolbar={toolbar}
      actions={
        <Button
          variant={stage === 'all' ? 'secondary' : 'ghost'}
          size="sm"
          aria-pressed={stage === 'all'}
          onClick={() => onChange('all')}
        >
          {common('all')}
        </Button>
      }
    >
      {PERIODIC_STAGES.map(([value, label]) => (
        <ReportStatusCard
          key={value}
          label={t(label)}
          active={stage === value}
          count={counts?.stages?.[value]}
          total={counts?.total}
          appearance={getPeriodicStageAppearance(value)}
          onClick={() => onChange(value)}
        />
      ))}
    </ReportStatusDashboard>
  );
}
