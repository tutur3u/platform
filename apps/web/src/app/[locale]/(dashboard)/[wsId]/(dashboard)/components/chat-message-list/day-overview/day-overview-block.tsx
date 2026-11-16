'use client';

import { Check, Clock, Target, Zap } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import { DayOverviewScheduleCard } from './day-overview-schedule-card';
import { DayOverviewTasksCard } from './day-overview-tasks-card';
import type { DayOverview } from './parse-day-overview';

const FOLLOW_UPS = [
  { key: 'plan', icon: Target },
  { key: 'reschedule', icon: Clock },
  { key: 'focus', icon: Zap },
] as const;

/** Quiet replacement for the generic tool row, with the tool's real time. */
export function DayOverviewTrace({
  durationMs,
}: {
  durationMs: number | null;
}) {
  const t = useTranslations('dashboard.mira_chat.day_overview');
  return (
    <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-secondary px-2.5 py-0.5 font-semibold text-muted-foreground text-xs">
      <Check className="size-3.5" aria-hidden />
      {durationMs === null
        ? t('checked')
        : t('checked_with_time', {
            seconds: (Math.max(durationMs, 100) / 1000).toFixed(1),
          })}
    </span>
  );
}

export function DayOverviewCards({ day }: { day: DayOverview }) {
  return (
    <div className="flex w-full min-w-0 flex-col gap-3">
      <DayOverviewScheduleCard day={day} />
      <DayOverviewTasksCard day={day} />
    </div>
  );
}

export function DayOverviewFollowUps({
  onSend,
  disabled,
}: {
  onSend: (prompt: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations('dashboard.mira_chat.day_overview');
  return (
    <div className="flex flex-wrap gap-2">
      {FOLLOW_UPS.map(({ key, icon: Icon }) => (
        <button
          key={key}
          type="button"
          disabled={disabled}
          onClick={() => onSend(t(`followup_${key}_prompt`))}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-card px-3.5 font-bold text-sm shadow-[var(--sorbet-shadow-sm,0_1px_2px_rgb(0_0_0/0.08))] transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50"
        >
          <Icon className="size-4" aria-hidden />
          {t(`followup_${key}`)}
        </button>
      ))}
    </div>
  );
}
