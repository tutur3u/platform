import { Clock } from '@tuturuuu/icons';
import dayjs from 'dayjs';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { formatDuration } from '@/lib/time-format';
import type { SessionWithRelations } from '../../../types';

interface SessionInfoBannerProps {
  session: SessionWithRelations;
  thresholdDays: number | null;
  currentTime: number;
}

export function SessionInfoBanner({
  session,
  thresholdDays,
  currentTime,
}: SessionInfoBannerProps) {
  const t = useTranslations('time-tracker.missed_entry_dialog');

  const sessionStartTime = useMemo(
    () => (session?.start_time ? dayjs(session.start_time) : null),
    [session?.start_time]
  );

  const currentDuration = useMemo(() => {
    if (!sessionStartTime) return 0;
    return dayjs(currentTime).diff(sessionStartTime, 'second');
  }, [sessionStartTime, currentTime]);

  return (
    <>
      {/* Session info banner */}
      <div className="rounded-lg border border-dynamic-orange/30 bg-dynamic-orange/10 p-4">
        <div className="flex items-start gap-3">
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-dynamic-orange" />
          <div className="flex-1 space-y-1">
            <p className="font-medium">
              {session.title || t('exceeded.untitledSession')}
            </p>
            <p className="text-muted-foreground text-sm">
              {t('exceeded.startedAt', {
                time: sessionStartTime?.format('MMM D, YYYY [at] h:mm A') || '',
              })}
            </p>
            <p className="font-mono text-dynamic-orange text-sm">
              {t('exceeded.runningFor', {
                duration: formatDuration(currentDuration),
              })}
            </p>
          </div>
        </div>
      </div>

      {/* Warning message */}
      <div className="rounded-lg bg-muted p-4">
        <p className="text-muted-foreground text-sm">
          {thresholdDays === 0
            ? t('exceeded.allEntriesRequireApproval')
            : t('exceeded.exceedsThreshold', {
                days: thresholdDays ?? 1,
              })}
        </p>
      </div>
    </>
  );
}
