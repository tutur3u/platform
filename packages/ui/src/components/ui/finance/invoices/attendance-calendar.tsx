import { useMemo } from 'react';

interface AttendanceCalendarProps {
  userAttendance: {
    date: string;
    status: string;
  }[];
  selectedMonth: string;
  selectedGroup: any;
  locale: string;
}

export function AttendanceCalendar({
  userAttendance,
  selectedMonth,
  selectedGroup,
  locale,
}: AttendanceCalendarProps) {
  const currentDate = useMemo(
    () => new Date(`${selectedMonth}-01`),
    [selectedMonth]
  );

  // Get group sessions for the month
  const groupSessions = useMemo(() => {
    if (!selectedGroup?.workspace_user_groups?.sessions) return [];
    return selectedGroup.workspace_user_groups.sessions;
  }, [selectedGroup]);

  // Create attendance map for quick lookup
  const attendanceMap = useMemo(() => {
    const map = new Map();
    userAttendance.forEach((attendance) => {
      const date = new Date(attendance.date);
      const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      map.set(dateKey, attendance.status?.toUpperCase() || 'PRESENT');
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

  const isDateAvailable = (sessions: string[], currentDate: Date) => {
    if (!sessions || !Array.isArray(sessions)) return false;

    try {
      const startOfMonth = new Date(`${selectedMonth}-01`);
      const nextMonth = new Date(startOfMonth);
      nextMonth.setMonth(nextMonth.getMonth() + 1);

      return sessions.some((session) => {
        if (!session) return false;
        const sessionDate = new Date(session);
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
    const attendanceStatus = getAttendanceStatus(date);

    if (!isCurrentMonthDay) {
      return 'text-foreground/20 bg-transparent border-transparent';
    }

    if (!hasSession) {
      return 'text-foreground/30 bg-muted/30 border-transparent';
    }

    // Has session - style based on attendance
    switch (attendanceStatus) {
      case 'PRESENT':
        return 'text-green-800 bg-green-100 border-green-200 font-semibold';
      case 'LATE':
        return 'text-yellow-800 bg-yellow-100 border-yellow-200 font-semibold';
      case 'ABSENT':
        return 'text-red-800 bg-red-100 border-red-200 font-semibold';
      default:
        // Has session but no attendance record
        return 'text-foreground/50 bg-muted/50 border-foreground/20';
    }
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
            const hasSession = isDateAvailable(groupSessions, day);
            const attendanceStatus = getAttendanceStatus(day);

            return (
              <div
                key={`${selectedMonth}-day-${idx}`}
                className={`flex justify-center rounded border p-2 transition-colors ${getDayStyles(day)}`}
                title={
                  isCurrentMonthDay && hasSession
                    ? `${day.toLocaleDateString()}: ${
                        attendanceStatus || 'No attendance record'
                      }`
                    : isCurrentMonthDay
                      ? `${day.toLocaleDateString()}: No session`
                      : day.toLocaleDateString()
                }
              >
                {day.getDate()}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
