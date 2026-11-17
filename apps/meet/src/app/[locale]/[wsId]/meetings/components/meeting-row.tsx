'use client';

import { Calendar, Ellipsis, Pencil, Trash2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { cn } from '@tuturuuu/utils/format';
import { useLocale, useTranslations } from 'next-intl';
import { CALENDAR_URL } from '@/constants/common';
import { MeetingRoomAction } from '@/features/call/components/meeting-room-action';
import { buildCalendarEventUrl } from '@/features/call/lib/calendar-link';
import { MeetingTimeRange } from './meeting-time';
import { formatMeetingDuration } from './section-rules';
import type { MeetingManagement, ScheduledMeeting } from './types';

export function calendarEventHref(
  wsId: string,
  calendar: NonNullable<ScheduledMeeting['calendar']>
) {
  return buildCalendarEventUrl(CALENDAR_URL, wsId, {
    id: calendar.id,
    start_at: calendar.startAt,
  });
}

/**
 * One meeting: when, what, and the single primary room action. Calendar and
 * management actions stay in the row's menu so the list reads calmly.
 */
export function MeetingRow({
  meeting,
  accountId,
  wsId,
  timeZone,
  withDate,
  management,
  compactAction = false,
}: {
  meeting: ScheduledMeeting;
  accountId: string;
  wsId: string;
  timeZone: string | undefined;
  withDate: boolean;
  management: MeetingManagement;
  /** Icon-only room action with a tooltip, for long lists of past meetings. */
  compactAction?: boolean;
}) {
  const t = useTranslations('meet.meetings');
  const locale = useLocale();
  const duration = compactAction
    ? formatMeetingDuration(meeting, locale)
    : null;
  const calendarHref = meeting.calendar
    ? calendarEventHref(wsId, meeting.calendar)
    : null;
  return (
    <li
      className={cn(
        'flex gap-3 px-4 py-3 md:px-5',
        compactAction ? 'items-center' : 'flex-col sm:flex-row sm:items-center'
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-sm">{meeting.name}</p>
        <p className="flex flex-wrap items-center gap-x-2 text-muted-foreground text-sm">
          <MeetingTimeRange
            meeting={meeting}
            noTimeLabel={t('no_time')}
            timeZone={timeZone}
            withDate={withDate}
          />
          {duration && <span className="tabular-nums">{duration}</span>}
          {calendarHref && (
            <a
              className="inline-flex items-center gap-1 rounded-sm underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              href={calendarHref}
              rel="noreferrer"
              target="_blank"
            >
              <Calendar aria-hidden className="size-3.5" />
              {t('in_calendar')}
            </a>
          )}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex">
          <MeetingRoomAction
            accountId={accountId}
            compact={compactAction}
            meetingId={meeting.id}
          />
        </div>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={t('more_actions', { name: meeting.name })}
              size="icon"
              variant="ghost"
              className="size-8"
            >
              <Ellipsis className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onSelect={() => management.onEdit(meeting)}>
              <Pencil className="size-4" />
              {t('edit')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => management.onDelete(meeting)}
            >
              <Trash2 className="size-4" />
              {t('delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}
