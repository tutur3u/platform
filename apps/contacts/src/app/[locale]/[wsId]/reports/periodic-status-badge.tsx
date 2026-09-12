'use client';

import type {
  PeriodicReportDeliveryStatus,
  PeriodicReportStage,
} from '@tuturuuu/internal-api/reports';
import { Badge } from '@tuturuuu/ui/badge';
import {
  getPostApprovalStatusAppearance,
  getPostEmailStatusAppearance,
} from '@tuturuuu/users-ui/components/post-status-meta';
import { useTranslations } from 'next-intl';
import {
  getPeriodicStageAppearance,
  PERIODIC_STAGES,
} from './periodic-stage-meta';

export function PeriodicStatusBadge({
  approval,
  delivery,
}: {
  approval?: 'APPROVED' | 'PENDING' | 'REJECTED' | null;
  delivery?: PeriodicReportDeliveryStatus;
}) {
  const t = useTranslations('reports-hub');
  const approvalValue = approval === null ? 'PENDING' : approval;
  const appearance = approvalValue
    ? getPostApprovalStatusAppearance(approvalValue)
    : getPostEmailStatusAppearance(delivery === 'draft' ? undefined : delivery);
  const Icon = appearance.icon;
  return (
    <Badge variant="outline" className={appearance.className}>
      <Icon
        className={`mr-1 size-3 ${'iconClassName' in appearance ? (appearance.iconClassName ?? '') : ''}`}
      />
      {delivery === 'draft'
        ? t('not_sent')
        : t(
            `status_${approvalValue ? (approvalValue.toLowerCase() as 'approved' | 'pending' | 'rejected') : (delivery ?? 'draft')}`
          )}
    </Badge>
  );
}

export function PeriodicStageBadge({ stage }: { stage: PeriodicReportStage }) {
  const t = useTranslations('reports-hub');
  const meta = PERIODIC_STAGES.find(([key]) => key === stage)!;
  const appearance = getPeriodicStageAppearance(stage);
  const Icon = appearance.icon;
  return (
    <Badge variant="outline" className={appearance.className}>
      <Icon className={`mr-1 size-3 ${appearance.iconClassName ?? ''}`} />
      {t(meta[1])}
    </Badge>
  );
}
