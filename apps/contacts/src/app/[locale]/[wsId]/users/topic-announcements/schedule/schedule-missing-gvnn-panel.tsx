'use client';

import { CheckCircle2, UserX } from '@tuturuuu/icons';
import { useLocale, useTranslations } from 'next-intl';
import type { MissingGvnnReminder } from './missing-gvnn';
import { formatScheduleDay } from './schedule-format';

/** Per-class list of sessions still without a GVNN, with jump-to-session. */
export function ScheduleMissingGvnnPanel({
  onJump,
  reminder,
}: {
  onJump: (key: string) => void;
  reminder: MissingGvnnReminder;
}) {
  const t = useTranslations('ws-topic-announcements');
  const locale = useLocale();

  return (
    <section
      aria-labelledby="schedule-missing-gvnn-title"
      className="rounded-lg border p-3"
    >
      <div className="mb-2">
        <h3
          className="flex items-center gap-2 font-semibold text-sm"
          id="schedule-missing-gvnn-title"
        >
          <UserX className="h-4 w-4 text-dynamic-orange" />
          {t('schedule_needs_gvnn')}
        </h3>
      </div>

      {reminder.total === 0 ? (
        <p className="flex items-center gap-2 text-muted-foreground text-sm">
          <CheckCircle2 className="h-4 w-4 text-dynamic-green" />
          {t('schedule_all_have_gvnn')}
        </p>
      ) : (
        <ul className="max-h-80 space-y-3 overflow-y-auto pr-1">
          {reminder.classes.map((entry) => (
            <li key={entry.groupId ?? 'none'}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="truncate font-medium">{entry.label}</span>
                <span className="text-muted-foreground tabular-nums">
                  {entry.sessions.length}
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {entry.sessions.map((session) => (
                  <button
                    className="rounded border border-dynamic-orange/30 bg-dynamic-orange/5 px-1.5 py-0.5 text-xs tabular-nums hover:bg-dynamic-orange/15"
                    key={session.key}
                    onClick={() => onJump(session.key)}
                    type="button"
                  >
                    {formatScheduleDay(session.sessionDate, locale)}{' '}
                    {session.startTime}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
