'use client';

import type { PeriodicReportDeliveryStatus } from '@tuturuuu/internal-api/reports';
import { Badge } from '@tuturuuu/ui/badge';
import {
  getPostApprovalStatusAppearance,
  getPostEmailStatusAppearance,
} from '@tuturuuu/users-ui/components/post-status-meta';
import { useTranslations } from 'next-intl';

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
