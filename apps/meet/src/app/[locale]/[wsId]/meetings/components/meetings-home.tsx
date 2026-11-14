'use client';

import { Loader2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { CurrentSection } from './current-section';
import { useViewerTimeZone } from './meeting-time';
import { PastSection } from './past-section';
import { currentMeetingsToShow } from './section-rules';
import type {
  MeetingManagement,
  MeetingsHomeSchedule,
  MeetingsHomeState,
  PastController,
  ScheduleSync,
} from './types';
import { UpcomingSection } from './upcoming-section';

interface MeetingsHomeProps {
  state: MeetingsHomeState;
  past: PastController;
  onRetry: () => void;
  accountId: string;
  wsId: string;
  management: MeetingManagement;
}

/** Current (only with live evidence), then Upcoming, then Past. */
export function MeetingsHome(props: MeetingsHomeProps) {
  const t = useTranslations('meet.meetings');
  const commonT = useTranslations('common');
  const { state } = props;
  switch (state.kind) {
    case 'loading':
      return (
        <section
          aria-busy
          aria-labelledby="meetings-upcoming"
          className="space-y-3"
        >
          <h2
            className="font-semibold text-base tracking-tight"
            id="meetings-upcoming"
          >
            {t('section_upcoming')}
          </h2>
          <div className="divide-y overflow-hidden rounded-xl border bg-card">
            {[0, 1, 2].map((row) => (
              <div className="space-y-2 px-4 py-4 md:px-5" key={row}>
                <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
                <div className="h-3 w-1/4 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
        </section>
      );
    case 'error':
      return (
        <div
          className="flex flex-col items-center gap-3 rounded-xl border bg-card px-4 py-8 text-center text-sm"
          role="alert"
        >
          {t('load_failed')}
          <Button onClick={props.onRetry} size="sm" variant="outline">
            {commonT('refresh')}
          </Button>
        </div>
      );
    case 'ready':
      return (
        <ReadyHome {...props} schedule={state.schedule} sync={state.sync} />
      );
    default: {
      const unreachable: never = state;
      return unreachable;
    }
  }
}

function ReadyHome({
  schedule,
  sync,
  past,
  onRetry,
  accountId,
  wsId,
  management,
}: Omit<MeetingsHomeProps, 'state'> & {
  schedule: MeetingsHomeSchedule;
  sync: ScheduleSync;
}) {
  const timeZone = useViewerTimeZone(schedule.viewerTimezone);
  const live = currentMeetingsToShow(schedule);
  const showPast =
    past.count.loaded > 0 || past.count.more || past.search !== '';
  return (
    <div className="space-y-8">
      <SyncStatus onRetry={onRetry} sync={sync} />
      {live && <CurrentSection meetings={live} />}
      <UpcomingSection
        accountId={accountId}
        calendarAccess={schedule.calendarAccess}
        management={management}
        meetings={schedule.upcoming}
        now={schedule.evaluatedAt}
        timeZone={timeZone}
        wsId={wsId}
      />
      {showPast && (
        <PastSection
          {...past}
          accountId={accountId}
          management={management}
          timeZone={timeZone}
          wsId={wsId}
        />
      )}
    </div>
  );
}

function SyncStatus({
  sync,
  onRetry,
}: {
  sync: ScheduleSync;
  onRetry: () => void;
}) {
  const t = useTranslations('meet.meetings');
  const commonT = useTranslations('common');
  return (
    <div
      className="-mb-6 flex min-h-5 items-center gap-2 text-muted-foreground text-xs"
      role="status"
    >
      {sync === 'refreshing' && (
        <>
          <Loader2 aria-hidden className="size-3 motion-safe:animate-spin" />
          {t('refreshing')}
        </>
      )}
      {sync === 'stale' && (
        <>
          {t('refresh_failed')}
          <Button onClick={onRetry} size="sm" variant="ghost">
            {commonT('refresh')}
          </Button>
        </>
      )}
    </div>
  );
}
