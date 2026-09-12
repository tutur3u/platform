'use client';
import { FileText } from '@tuturuuu/icons';
import type {
  PeriodicReportCounts,
  PeriodicReportStage,
} from '@tuturuuu/internal-api/reports';
import { Button } from '@tuturuuu/ui/button';
import { getPostReviewStageAppearance } from '@tuturuuu/users-ui/components/post-status-meta';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import {
  ReportStatusCard,
  ReportStatusDashboard,
} from './report-status-dashboard';

export { PERIODIC_STAGES } from './periodic-stage-meta';

import { PERIODIC_STAGES } from './periodic-stage-meta';

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
    <ReportStatusDashboard
      label={t('report_status')}
      total={counts?.total}
      totalLabel={t('total_reports')}
      toolbar={toolbar}
      actions={
        <>
          {stage !== 'all' && (
            <Button variant="outline" size="sm" onClick={() => onChange('all')}>
              {t('show_all_reports')}
            </Button>
          )}
          {stage !== 'pending' && (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => onChange('pending')}
            >
              {t('status_pending')}
            </Button>
          )}
        </>
      }
    >
      {PERIODIC_STAGES.map(([value, label, appearanceKey]) => {
        const appearance = getPostReviewStageAppearance(appearanceKey);
        return (
          <ReportStatusCard
            key={value}
            label={t(label)}
            count={counts?.stages?.[value]}
            total={counts?.total}
            active={stage === value}
            appearance={
              value === 'draft' ? { ...appearance, icon: FileText } : appearance
            }
            onClick={() => onChange(value)}
          />
        );
      })}
    </ReportStatusDashboard>
  );
}
