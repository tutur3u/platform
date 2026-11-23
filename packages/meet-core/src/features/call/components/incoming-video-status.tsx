import { useTranslations } from 'next-intl';
import type { ReceiveStatus } from '../lib/receive-recovery';

/**
 * Quiet, low-priority note shown only after automatic receive recovery has
 * used all of its retries. It never blocks the room and offers no action.
 */
export function IncomingVideoStatus({ status }: { status: ReceiveStatus }) {
  const t = useTranslations('meet.call');
  if (status !== 'unavailable') return null;
  return (
    <p
      role="status"
      className="shrink-0 px-2 pb-1 text-center text-muted-foreground/70 text-xs"
    >
      {t('incoming_video_unavailable')}
    </p>
  );
}
