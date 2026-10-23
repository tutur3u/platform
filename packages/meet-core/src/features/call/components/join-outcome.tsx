'use client';

import { WifiOff } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import type { MeetSignalingStatus } from '../lib/signaling';
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
      busy={false}
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
  return (
    <output className="flex items-center gap-1.5 text-muted-foreground text-xs">
      <WifiOff className="size-3.5" />
      {t(status === 'connecting' ? 'reconnecting' : 'join_error_title')}
      {status !== 'connecting' && (
        <Button size="sm" variant="outline" onClick={onRetry}>
          {t('connection_refresh')}
        </Button>
      )}
    </output>
  );
}
