'use client';

import { CalendarIcon, ChevronLeft, ChevronRight } from '@tuturuuu/icons';
import type { WorkspaceUserGroupSession } from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { cn } from '@tuturuuu/utils/format';
import { format } from 'date-fns';
import { useTranslations } from 'next-intl';

interface Props {
  calendarMonth: Date;
  currentDate: Date;
  days: string[];
  daysInMonth: Date[];
  isNextDisabled: boolean;
  isPrevDisabled: boolean;
  locale: string;
  onDateSelect: (day: Date, sessions: WorkspaceUserGroupSession[]) => void;
  onMonthChange: (month: Date) => void;
  sessionsByDate: Map<string, WorkspaceUserGroupSession[]>;
}

function formatSessionTimeRange(
  session: WorkspaceUserGroupSession,
  locale: string
) {
  const start = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: session.startTimezone || 'Asia/Ho_Chi_Minh',
  });
  const end = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone:
      session.endTimezone || session.startTimezone || 'Asia/Ho_Chi_Minh',
  });
  return `${start.format(new Date(session.startsAt))} - ${end.format(new Date(session.endsAt))}`;
}

export function GroupAttendanceCalendar({
  calendarMonth,
  currentDate,
  days,
  daysInMonth,
  isNextDisabled,
  isPrevDisabled,
  locale,
  onDateSelect,
  onMonthChange,
  sessionsByDate,
}: Props) {
  const tAtt = useTranslations('ws-user-group-attendance');

  return (
    <Card className="@min-[72rem]:sticky @min-[72rem]:top-4 h-fit min-w-0 overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between gap-2 p-4 sm:p-6">
        <CardTitle className="flex items-center gap-3 font-bold">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-dynamic-purple/10 text-dynamic-purple">
            <CalendarIcon className="h-5 w-5" />
          </span>
          {format(currentDate, 'dd/MM/yyyy')}
        </CardTitle>
        <div className="flex items-center gap-1">
          <Button
            size="xs"
            variant="secondary"
            onClick={() =>
              onMonthChange(
                new Date(
                  calendarMonth.getFullYear(),
                  calendarMonth.getMonth() - 1,
                  1
                )
              )
            }
            disabled={isPrevDisabled}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <Button
            size="xs"
            variant="secondary"
            onClick={() =>
              onMonthChange(
                new Date(
                  calendarMonth.getFullYear(),
                  calendarMonth.getMonth() + 1,
                  1
                )
              )
            }
            disabled={isNextDisabled}
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-3 sm:px-6 sm:pb-4">
        <div className="mb-2 font-semibold text-foreground/60">
          {calendarMonth.getFullYear()} /{' '}
          {calendarMonth.toLocaleString(locale, { month: '2-digit' })}
        </div>
        <div className="relative grid gap-1 text-xs md:gap-2 md:text-base">
          <div className="grid grid-cols-7 gap-1 md:gap-2">
            {days.map((day, index) => (
              <div
                key={`${day}-${index}`}
                className="flex justify-center rounded bg-foreground/5 p-2 font-semibold md:rounded-lg"
              >
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1 md:gap-2">
            {daysInMonth.map((day) => {
              const isCurrentMonth =
                day.getMonth() === calendarMonth.getMonth();
              const sessions =
                sessionsByDate.get(format(day, 'yyyy-MM-dd')) ?? [];
              const isSelected =
                format(day, 'yyyy-MM-dd') === format(currentDate, 'yyyy-MM-dd');
              const base =
                'flex justify-center rounded p-1 font-semibold sm:p-2 md:rounded-lg';

              if (!isCurrentMonth) {
                return (
                  <div
                    key={day.toISOString()}
                    aria-hidden="true"
                    className={cn(
                      base,
                      'cursor-default border border-transparent'
                    )}
                  />
                );
              }

              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => onDateSelect(day, sessions)}
                  className={cn(
                    base,
                    'relative min-h-10 flex-col items-center border transition-[background-color,border-color,box-shadow] duration-200 sm:min-h-14',
                    isSelected
                      ? 'border-dynamic-purple/40 bg-dynamic-purple/15 font-bold text-foreground shadow-md'
                      : sessions.length
                        ? 'border-foreground/10 bg-foreground/10 text-foreground hover:border-dynamic-purple/20 hover:bg-foreground/20 hover:shadow-sm'
                        : 'border-transparent text-foreground/30 hover:bg-foreground/5 hover:text-foreground/60'
                  )}
                >
                  <span>{day.getDate()}</span>
                  {sessions.length > 0 && (
                    <>
                      <span className="mt-1 hidden max-w-full truncate rounded bg-dynamic-blue/10 px-1.5 py-0.5 text-[10px] text-dynamic-blue sm:block">
                        {sessions.length === 1
                          ? formatSessionTimeRange(sessions[0]!, locale)
                          : tAtt('session_count_short', {
                              count: sessions.length,
                            })}
                      </span>
                      <span
                        className="mt-1 h-1.5 w-1.5 rounded-full bg-dynamic-blue sm:hidden"
                        aria-hidden="true"
                      />
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
