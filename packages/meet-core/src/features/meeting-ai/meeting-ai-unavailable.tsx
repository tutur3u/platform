'use client';

import {
  CircleAlert,
  Lock,
  RefreshCw,
  ShieldOff,
  Users,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';

/** Mirrors `MeetTranscriptUnavailableReason` from the state response. */
type UnavailableReason = 'disabled' | 'workspace' | 'audience' | 'error';

export type MeetingAiBlock =
  | { kind: 'load_failed' }
  | { kind: 'not_configured' }
  | { kind: 'off'; reason: UnavailableReason };

const icons: Record<UnavailableReason, typeof Lock> = {
  disabled: ShieldOff,
  workspace: Lock,
  audience: Users,
  error: CircleAlert,
};

/**
 * Why the transcript and notes cannot run, and who can change it. Retry is
 * offered only where repeating the request can help.
 */
export function MeetingAiUnavailable({
  block,
  onRetry,
  retrying = false,
}: {
  block: MeetingAiBlock;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  const t = useTranslations('meet.ai');
  const reason =
    block.kind === 'off'
      ? block.reason
      : block.kind === 'load_failed'
        ? 'error'
        : 'disabled';
  const Icon = icons[reason];
  const [title, body] =
    block.kind === 'load_failed'
      ? [t('load_failed_title'), t('load_failed')]
      : block.kind === 'not_configured'
        ? [t('off_title'), t('not_configured')]
        : [
            t('off_title'),
            {
              disabled: t('off_disabled'),
              workspace: t('off_workspace'),
              audience: t('off_audience'),
              error: t('off_error'),
            }[block.reason],
          ];
  const retryable = reason === 'error' && onRetry;
  return (
    <div
      role={reason === 'error' ? 'alert' : 'status'}
      className="flex items-start gap-3 rounded-lg border bg-muted/40 p-3 text-sm"
    >
      <Icon
        aria-hidden
        className={`mt-0.5 size-4 shrink-0 ${
          reason === 'error' ? 'text-dynamic-red' : 'text-muted-foreground'
        }`}
      />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-medium">{title}</p>
        <p className="text-muted-foreground">{body}</p>
        {retryable && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-2"
            disabled={retrying}
            onClick={onRetry}
          >
            <RefreshCw
              aria-hidden
              className={`size-4 ${retrying ? 'motion-safe:animate-spin' : ''}`}
            />
            {t('try_again')}
          </Button>
        )}
      </div>
    </div>
  );
}
