'use client';

import { FileText } from '@tuturuuu/icons';
import type { PeriodicReportCounts } from '@tuturuuu/internal-api/reports';
import { Button } from '@tuturuuu/ui/button';
import { getPostReviewStageAppearance } from '@tuturuuu/users-ui/components/post-status-meta';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type {
  PeriodicApprovalFilter,
  PeriodicDeliveryFilter,
} from './periodic-reports-toolbar';
import {
  ReportStatusCard,
  ReportStatusDashboard,
} from './report-status-dashboard';

export function PeriodicStatusSummary({
  generation = 'all',
  counts,
  approval,
  delivery,
  onChange,
  toolbar,
}: {
  generation?: 'all' | 'draft';
  toolbar?: ReactNode;
  counts?: PeriodicReportCounts;
  approval: PeriodicApprovalFilter;
  delivery: PeriodicDeliveryFilter;
  onChange: (
    approval: PeriodicApprovalFilter,
    delivery: PeriodicDeliveryFilter,
    generation?: 'all' | 'draft'
  ) => void;
}) {
  const t = useTranslations('reports-hub');
  const stages = [
    {
      label: 'drafts',
      count: counts?.draft,
      approval: 'all',
      delivery: 'all',
      appearance: {
        ...getPostReviewStageAppearance('missing_check'),
        icon: FileText,
      },
    },
    {
      label: 'unapproved',
      count: counts ? Math.max(0, counts.total - counts.approved) : undefined,
      approval: 'UNAPPROVED',
      delivery: 'all',
      appearance: getPostReviewStageAppearance('pending_approval'),
    },
    {
      label: 'approved',
      count: counts?.approved,
      approval: 'APPROVED',
      delivery: 'all',
      appearance: getPostReviewStageAppearance('approved_awaiting_delivery'),
    },
    {
      label: 'status_sent',
      count: counts?.delivered,
      approval: 'all',
      delivery: 'sent',
      appearance: getPostReviewStageAppearance('sent'),
    },
    {
      label: 'failed',
      count: counts?.failed,
      approval: 'all',
      delivery: 'failed',
      appearance: getPostReviewStageAppearance('delivery_failed'),
    },
    {
      label: 'status_blocked',
      count: counts?.blocked,
      approval: 'all',
      delivery: 'blocked',
      appearance: getPostReviewStageAppearance('undeliverable'),
    },
  ] as const;
  const isShowingAll =
    approval === 'all' && delivery === 'all' && generation === 'all';
  const isUnapproved =
    approval === 'UNAPPROVED' && delivery === 'all' && generation === 'all';
  return (
    <ReportStatusDashboard
      label={t('report_status')}
      total={counts?.total}
      totalLabel={t('total_reports')}
      columns={3}
      toolbar={toolbar}
      actions={
        <>
          {!isShowingAll && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onChange('all', 'all', 'all')}
            >
              {t('show_all_reports')}
            </Button>
          )}
          {!isUnapproved && (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => onChange('UNAPPROVED', 'all', 'all')}
            >
              {t('unapproved')}
            </Button>
          )}
        </>
      }
    >
      {stages.map((stage) => {
        const stageGeneration = stage.label === 'drafts' ? 'draft' : 'all';
        return (
          <ReportStatusCard
            key={stage.label}
            label={t(stage.label)}
            count={stage.count}
            total={counts?.total}
            active={
              approval === stage.approval &&
              delivery === stage.delivery &&
              generation === stageGeneration
            }
            appearance={stage.appearance}
            onClick={() =>
              onChange(stage.approval, stage.delivery, stageGeneration)
            }
          />
        );
      })}
    </ReportStatusDashboard>
  );
}
