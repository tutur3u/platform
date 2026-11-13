'use client';

import { Loader2, WifiOff } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import {
  getSignalingRecovery,
  type MeetSignalingStatus,
} from '../lib/signaling';
import { CallPreparation } from './call-preparation';

export function JoinOutcome({
  reason,
  meetingName,
  leaveHref = '/',
  onRetry,
}: {
  reason: 'denied' | 'removed' | 'missing' | 'error';
  meetingName?: string;
  leaveHref?: string;
  onRetry?: () => void;
}) {
  const t = useTranslations('meet.call');
  return (
    <CallPreparation
      lifecycle="error"
      meetingName={meetingName}
      leaveHref={leaveHref}
      title={t(`join_${reason}_title`)}
      description={t(`join_${reason}_hint`)}
    >
      {onRetry && <Button onClick={onRetry}>{t('connection_refresh')}</Button>}
    </CallPreparation>
  );
}

export function CallConnectionNotice({
  status,
  onRetry,
}: {
  status: MeetSignalingStatus;
  onRetry: () => void;
}) {
  const t = useTranslations('meet.call');
  if (status === 'open') return null;
  // Automatic recovery is routine (deploys restart the room server), so it
  // stays a quiet status; the error and manual refresh appear only once
  // signaling has stopped retrying.
  if (getSignalingRecovery(status) !== 'exhausted') {
    return (
      <output
        aria-live="polite"
        className="flex items-center gap-1.5 text-muted-foreground text-xs"
      >
        <Loader2 aria-hidden className="size-3.5 motion-safe:animate-spin" />
        {t('reconnecting')}
      </output>
    );
  }
  return (
    <output
      aria-live="polite"
      className="flex items-center gap-1.5 text-muted-foreground text-xs"
    >
      <WifiOff aria-hidden className="size-3.5" />
      {t('join_error_title')}
      <Button size="sm" variant="outline" onClick={onRetry}>
        {t('connection_refresh')}
      </Button>
    </output>
  );
}
