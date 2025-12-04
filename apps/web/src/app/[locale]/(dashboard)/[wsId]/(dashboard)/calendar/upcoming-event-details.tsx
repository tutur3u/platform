'use client';

import { Clock } from '@tuturuuu/icons';
import type { WorkspaceCalendarEvent } from '@tuturuuu/types';
import { useCalendarPreferences } from '@tuturuuu/ui/hooks/use-calendar-preferences';
import { getTimeFormatPattern } from '@tuturuuu/utils/time-helper';
import { format, isThisWeek, isToday, isTomorrow } from 'date-fns';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

export default function UpcomingEventDetails({
  event,
}: {
  event: WorkspaceCalendarEvent;
}) {
  const { timeFormat } = useCalendarPreferences();
  const timePattern = getTimeFormatPattern(timeFormat);

  const getDateLabel = (dateString: string) => {
    const date = new Date(dateString);
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    if (isThisWeek(date)) return format(date, 'EEEE');
    return format(date, 'MMM d');
  };

  const formatEventTime = (startAt: string, endAt: string) => {
    const start = new Date(startAt);
    const end = new Date(endAt);

    if (isToday(start)) {
      return `${format(start, timePattern)} - ${format(end, timePattern)}`;
    }

    return `${format(start, `MMM d, ${timePattern}`)} - ${format(end, timePattern)}`;
  };

  const getRelativeTime = (startAt: string) => dayjs(startAt).fromNow();

  return (
    <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
      <div className="flex items-center gap-1 font-semibold text-dynamic-blue">
        <Clock className="h-3 w-3" />
        <span>{getDateLabel(event.start_at)}</span>
      </div>
      <span>•</span>
      <span className="font-semibold text-dynamic-green">
        {formatEventTime(event.start_at, event.end_at)}
      </span>
      <span>•</span>
      <span className="font-semibold text-dynamic-orange">
        {getRelativeTime(event.start_at)}
      </span>
    </div>
  );
}
