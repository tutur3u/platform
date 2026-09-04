'use client';

import type {
  TutoringAttendanceStatus,
  TutoringReasonType,
} from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { useTranslations } from 'next-intl';

type QueueReasonType = TutoringReasonType | 'BOTH';

/**
 * Semantic `dynamic-*` tokens instead of fixed Tailwind hues so both themes and
 * every workspace accent stay readable.
 */
const REASON_CLASSNAMES: Record<QueueReasonType, string> = {
  ABSENT_RECOVERY:
    'border-dynamic-orange/25 bg-dynamic-orange/10 text-dynamic-orange',
  BOTH: 'border-dynamic-purple/25 bg-dynamic-purple/10 text-dynamic-purple',
  CUSTOM: 'border-dynamic-gray/25 bg-dynamic-gray/10 text-dynamic-gray',
  WEAK_SUPPORT: 'border-dynamic-sky/25 bg-dynamic-sky/10 text-dynamic-sky',
};

const STATUS_CLASSNAMES: Record<TutoringAttendanceStatus, string> = {
  CANCELLED: 'border-dynamic-gray/25 bg-dynamic-gray/10 text-dynamic-gray',
  DONE: 'border-dynamic-green/25 bg-dynamic-green/10 text-dynamic-green',
  NO_SHOW: 'border-dynamic-red/25 bg-dynamic-red/10 text-dynamic-red',
  PENDING: 'border-dynamic-orange/25 bg-dynamic-orange/10 text-dynamic-orange',
};

export function useTutoringLabels() {
  const t = useTranslations('ws-tutoring');

  return {
    reason: (reason: QueueReasonType) => {
      if (reason === 'ABSENT_RECOVERY') return t('absent_recovery');
      if (reason === 'WEAK_SUPPORT') return t('weak_support');
      if (reason === 'BOTH') return t('both_reason');
      return t('custom_reason');
    },
    status: (status: TutoringAttendanceStatus) => {
      if (status === 'DONE') return t('status_done');
      if (status === 'NO_SHOW') return t('status_no_show');
      if (status === 'CANCELLED') return t('status_cancelled');
      return t('status_pending');
    },
  };
}

export function TutoringReasonBadge({ reason }: { reason: QueueReasonType }) {
  const labels = useTutoringLabels();

  return (
    <Badge
      className={`rounded-full ${REASON_CLASSNAMES[reason] ?? REASON_CLASSNAMES.CUSTOM}`}
      variant="outline"
    >
      {labels.reason(reason)}
    </Badge>
  );
}

export function TutoringStatusBadge({
  status,
}: {
  status: TutoringAttendanceStatus;
}) {
  const labels = useTutoringLabels();

  return (
    <Badge
      className={`rounded-full ${STATUS_CLASSNAMES[status] ?? STATUS_CLASSNAMES.PENDING}`}
      variant="outline"
    >
      {labels.status(status)}
    </Badge>
  );
}
