'use client';

import type {
  WorkspaceUserGroupMissingSessionOccurrence,
  WorkspaceUserGroupSession,
} from '@tuturuuu/internal-api';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import '@/lib/dayjs-setup';
import { CompactSchedulePopoverContent } from './compact-schedule-popover-content';
import type { CompactScheduleDayBucket } from './compact-schedule-utils';
import { compactSessionTimeLabel } from './compact-schedule-utils';

interface CompactScheduleDayProps {
  bucket?: CompactScheduleDayBucket;
  canUpdate: boolean;
  currentMonth: string;
  day: { date: Date; key: string };
  fullScheduleHref: string;
  locale: string;
  moveSource: WorkspaceUserGroupSession | null;
  onAddSession: (date: string) => void;
  onEditSession: (session: WorkspaceUserGroupSession) => void;
  onMoveHere: (date: string) => void;
  onMoveSession: (session: WorkspaceUserGroupSession) => void;
  onRepairMissing: (
    occurrence: WorkspaceUserGroupMissingSessionOccurrence
  ) => void;
}

function formatDayLabel(date: Date, locale: string, includeYear = false) {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    weekday: 'short',
    ...(includeYear ? { year: 'numeric' } : {}),
  }).format(date);
}

export function CompactScheduleDay({
  bucket,
  canUpdate,
  currentMonth,
  day,
  fullScheduleHref,
  locale,
  moveSource,
  onAddSession,
  onEditSession,
  onMoveHere,
  onMoveSession,
  onRepairMissing,
}: CompactScheduleDayProps) {
  const t = useTranslations('ws-user-group-schedule');
  const [open, setOpen] = useState(false);
  const sessions = bucket?.sessions ?? [];
  const missing = bucket?.missing ?? [];
  const overflowCount = Math.max(sessions.length + missing.length - 2, 0);
  const isCurrentMonth = day.key.startsWith(currentMonth);
  const isToday = day.key === dayjs().format('YYYY-MM-DD');

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onMouseEnter={() => setOpen(true)}
          onFocus={() => setOpen(true)}
          className={cn(
            'flex aspect-square min-h-[84px] flex-col rounded-md border p-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dynamic-blue/50',
            isCurrentMonth
              ? 'border-border/60 bg-background hover:border-dynamic-blue/40 hover:bg-dynamic-blue/5'
              : 'border-border/30 bg-foreground/[0.02] text-muted-foreground/60',
            (sessions.length > 0 || missing.length > 0) &&
              'border-dynamic-blue/30',
            missing.length > 0 && 'border-dynamic-red/40 bg-dynamic-red/5'
          )}
          aria-label={t('open_day_schedule', {
            date: formatDayLabel(day.date, locale, true),
          })}
        >
          <div className="flex items-center justify-between gap-1">
            <span
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded-md font-semibold text-xs',
                isToday && 'bg-dynamic-blue text-white'
              )}
            >
              {day.date.getDate()}
            </span>
            {missing.length > 0 ? (
              <span className="rounded-sm bg-dynamic-red/10 px-1 text-[10px] text-dynamic-red">
                {missing.length}
              </span>
            ) : null}
          </div>

          <div className="mt-1 flex min-h-0 flex-1 flex-col gap-1 overflow-hidden">
            {sessions.slice(0, 2).map((session) => (
              <span
                key={session.id}
                className="truncate rounded-sm bg-dynamic-blue/10 px-1.5 py-0.5 font-medium text-[10px] text-dynamic-blue"
              >
                {compactSessionTimeLabel(session)}
              </span>
            ))}
            {sessions.length === 0 &&
              missing.slice(0, 2).map((occurrence) => (
                <span
                  key={`${occurrence.seriesId}-${occurrence.date}`}
                  className="truncate rounded-sm bg-dynamic-red/10 px-1.5 py-0.5 font-medium text-[10px] text-dynamic-red"
                >
                  {t('missing_short')}
                </span>
              ))}
            {overflowCount > 0 ? (
              <span className="text-[10px] text-muted-foreground">
                {t('more_sessions', { count: overflowCount })}
              </span>
            ) : null}
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 max-w-[calc(100vw-2rem)] p-0"
        onMouseEnter={() => setOpen(true)}
        sideOffset={6}
      >
        <CompactSchedulePopoverContent
          bucket={bucket}
          canUpdate={canUpdate}
          dateLabel={formatDayLabel(day.date, locale)}
          fullScheduleHref={fullScheduleHref}
          moveSource={moveSource}
          onAddSession={() => onAddSession(day.key)}
          onEditSession={onEditSession}
          onMoveHere={() => onMoveHere(day.key)}
          onMoveSession={onMoveSession}
          onRepairMissing={onRepairMissing}
        />
      </PopoverContent>
    </Popover>
  );
}
