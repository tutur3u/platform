'use client';

import { RefreshCw, WifiOff } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import {
  getSignalingRecovery,
  type MeetSignalingStatus,
} from '../lib/signaling';
import { MeetingActionHint } from './meeting-action-hint';

/**
 * Minimal signaling status: nothing while connected, a quiet labelled icon
 * while signaling is still recovering on its own (`connecting` or
 * `reconnecting`), and a single refresh action only once recovery is
 * exhausted (`error`) or the server ended the call (`closed`).
 */
export function CallTopBarConnection({
  status,
  onRetry,
}: {
  status: MeetSignalingStatus;
  onRetry: () => void;
}) {
  const t = useTranslations('meet.call');
  if (status === 'open') return null;
  if (getSignalingRecovery(status) !== 'exhausted')
    return (
      <output
        aria-label={t('reconnecting')}
        aria-live="polite"
        className="inline-flex size-8 items-center justify-center text-muted-foreground"
        title={t('reconnecting')}
      >
        <WifiOff className="size-4 motion-safe:animate-pulse" />
      </output>
    );
  return (
    <MeetingActionHint label={t('join_error_title')}>
      <Button
        aria-label={`${t('join_error_title')}. ${t('connection_refresh')}`}
        className="h-8 gap-1.5 rounded-full text-xs"
        onClick={onRetry}
        size="sm"
        type="button"
        variant="outline"
      >
        <RefreshCw className="size-3.5" />
        {t('connection_refresh')}
      </Button>
    </MeetingActionHint>
  );
}
