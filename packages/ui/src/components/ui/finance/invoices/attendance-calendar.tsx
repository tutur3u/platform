import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

export interface AttendanceGroup {
  workspace_user_groups: {
    id: string;
    name: string;
    sessions?: string[];
  };
}

interface AttendanceCalendarProps {
  userAttendance: {
    date: string;
    status: string;
    group_id?: string;
  }[];
  selectedMonth: string;
  selectedGroups: AttendanceGroup[];
  locale: string;
}

export function AttendanceCalendar({
  userAttendance,
  selectedMonth,
  selectedGroups,
  locale,
}: AttendanceCalendarProps) {
  const t = useTranslations();

  const currentDate = useMemo(
    () => new Date(`${selectedMonth}-01`),
    [selectedMonth]
  );

  // Get all group sessions for the month with group info
  const groupSessions = useMemo(() => {
    return selectedGroups.flatMap((groupItem) => {
      const group = groupItem.workspace_user_groups;
      if (!group?.sessions) return [];
      return group.sessions.map((session: string) => ({
        date: session,
        groupId: group.id,
        groupName: group.name,
      }));
    });
  }, [selectedGroups]);

  // Create attendance map for quick lookup: date -> Map<groupId, status>
  const attendanceMap = useMemo(() => {
    const map = new Map<string, Map<string, string>>();
    userAttendance.forEach((attendance) => {
      const date = new Date(attendance.date);
      const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

      if (!map.has(dateKey)) {
        map.set(dateKey, new Map());
      }
      map
        .get(dateKey)!
        .set(
          attendance.group_id || 'default',
          attendance.status?.toUpperCase() || 'PRESENT'
        );
    });
    return map;
  }, [userAttendance]);

  // Weekday headers
  const days = Array.from({ length: 7 }, (_, i) => {
    const newDay = new Date(currentDate);
    newDay.setDate(currentDate.getDate() - currentDate.getDay() + i + 1);
    return newDay.toLocaleString(locale, { weekday: 'narrow' });
  });

  // All days in the calendar grid (including previous/next month days)
  const daysInMonth = Array.from({ length: 42 }, (_, i) => {
    const newDay = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      1
    );
    const dayOfWeek = newDay.getDay();
    const adjustment = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // adjust for Monday start
    newDay.setDate(newDay.getDate() - adjustment + i);
    return newDay;
  });

  const isCurrentMonth = (date: Date) =>
    date.getMonth() === currentDate.getMonth() &&
    date.getFullYear() === currentDate.getFullYear();

  const isDateAvailable = (
    sessions: { date: string; groupId: string; groupName: string }[],
    currentDate: Date
  ) => {
    if (!sessions || !Array.isArray(sessions)) return false;

    try {
      const startOfMonth = new Date(`${selectedMonth}-01`);
      const nextMonth = new Date(startOfMonth);
      nextMonth.setMonth(nextMonth.getMonth() + 1);

      return sessions.some((session) => {
        if (!session.date) return false;
        const sessionDate = new Date(session.date);
        // Check if date is valid
        if (Number.isNaN(sessionDate.getTime())) return false;
        return (
          sessionDate >= startOfMonth &&
          sessionDate < nextMonth &&
          sessionDate.getDate() === currentDate.getDate() &&
          sessionDate.getMonth() === currentDate.getMonth() &&
          sessionDate.getFullYear() === currentDate.getFullYear()
        );
      });
    } catch (error) {
      console.error('Error checking session availability:', error);
      return false;
    }
  };

  const getAttendanceStatus = (date: Date) => {
    const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return attendanceMap.get(dateKey);
  };

  const getDayStyles = (date: Date) => {
    const isCurrentMonthDay = isCurrentMonth(date);
    const hasSession = isDateAvailable(groupSessions, date);
    const attendanceStatusMap = getAttendanceStatus(date);

    if (!isCurrentMonthDay) {
      return 'text-foreground/20 bg-transparent border-transparent';
    }

    if (!hasSession) {
      return 'text-foreground/30 bg-muted/30 border-transparent';
    }

    // Has session - style based on attendance
    if (!attendanceStatusMap || attendanceStatusMap.size === 0) {
      return 'text-foreground/50 bg-muted/50 border-foreground/20';
    }

    const statuses = Array.from(attendanceStatusMap.values());

    if (statuses.includes('ABSENT')) {
      return 'text-dynamic-red bg-dynamic-red/10 border-dynamic-red/20 font-semibold';
    }

    if (statuses.includes('LATE')) {
      return 'text-dynamic-yellow bg-dynamic-yellow/10 border-dynamic-yellow/20 font-semibold';
    }

    if (statuses.includes('PRESENT')) {
      return 'text-dynamic-green bg-dynamic-green/10 border-dynamic-green/20 font-semibold';
    }

    return 'text-foreground/50 bg-muted/50 border-foreground/20';
  };

  return (
    <div className="rounded-lg border p-3">
      <div className="grid gap-1 text-xs">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 gap-1">
          {days.map((day, idx) => (
            <div
              key={`day-${idx}`}
              className="flex justify-center rounded bg-foreground/5 p-2 font-semibold"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar days */}
        <div className="grid grid-cols-7 gap-1">
          {daysInMonth.map((day, idx) => {
            const isCurrentMonthDay = isCurrentMonth(day);
            const dateSessions = groupSessions.filter((session) => {
              const sessionDate = new Date(session.date);
              return (
                sessionDate.getDate() === day.getDate() &&
                sessionDate.getMonth() === day.getMonth() &&
                sessionDate.getFullYear() === day.getFullYear()
              );
            });

            const hasSession = dateSessions.length > 0;
            const attendanceStatusMap = getAttendanceStatus(day);

            const content = (
              <div
                key={`${selectedMonth}-day-${idx}`}
                className={`flex justify-center rounded border p-2 transition-colors ${getDayStyles(day)}`}
              >
                {day.getDate()}
              </div>
            );

            if (!isCurrentMonthDay) return content;

            return (
              <Tooltip key={`${selectedMonth}-day-${idx}`}>
                <TooltipTrigger asChild>{content}</TooltipTrigger>
                <TooltipContent className="flex flex-col gap-1 p-2">
                  <p className="font-semibold">
                    {day.toLocaleDateString(locale, {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </p>
                  {hasSession ? (
                    <div className="flex flex-col gap-1">
                      {dateSessions.map((session) => {
                        const status = attendanceStatusMap?.get(
                          session.groupId
                        );
                        return (
                          <div
                            key={session.groupId}
                            className="flex items-center justify-between gap-4"
                          >
                            <span className="text-muted-foreground">
                              {session.groupName}:
                            </span>
                            <span
                              className={
                                status === 'PRESENT'
                                  ? 'font-medium text-dynamic-green'
                                  : status === 'LATE'
                                    ? 'font-medium text-dynamic-yellow'
                                    : status === 'ABSENT'
                                      ? 'font-medium text-dynamic-red'
                                      : 'text-muted-foreground'
                              }
                            >
                              {status === 'PRESENT'
                                ? t('ws-invoices.present')
                                : status === 'LATE'
                                  ? t('ws-invoices.late')
                                  : status === 'ABSENT'
                                    ? t('ws-invoices.absent')
                                    : t('ws-invoices.no_attendance')}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">
                      {t('ws-invoices.no_session')}
                    </p>
                  )}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </div>
    </div>
  );
}
