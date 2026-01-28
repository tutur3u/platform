export const getAttendanceStats = (
  attendance: { status: string; date: string }[]
) => {
  if (!attendance || !Array.isArray(attendance)) {
    return { present: 0, late: 0, absent: 0, total: 0 };
  }

  return attendance.reduce(
    (stats, record) => {
      const status = record.status?.toUpperCase();
      switch (status) {
        case 'PRESENT':
          stats.present++;
          break;
        case 'LATE':
          stats.late++;
          break;
        case 'ABSENT':
          stats.absent++;
          break;
        default:
          stats.present++;
          break;
      }
      stats.total++;
      return stats;
    },
    { present: 0, late: 0, absent: 0, total: 0 }
  );
};

export const getEffectiveAttendanceDays = (
  attendance: { status: string; date: string }[]
) => {
  const stats = getAttendanceStats(attendance);
  return stats.present + stats.late;
};

export const getSessionsForMonth = (
  sessionsArray: string[] | null,
  month: string
): number => {
  if (!Array.isArray(sessionsArray) || !month) return 0;

  try {
    const startOfMonth = new Date(`${month}-01`);
    const nextMonth = new Date(startOfMonth);
    nextMonth.setMonth(nextMonth.getMonth() + 1);

    const filteredSessions = sessionsArray.filter((sessionDate) => {
      if (!sessionDate) return false;
      const sessionDateObj = new Date(sessionDate);
      if (Number.isNaN(sessionDateObj.getTime())) return false;
      return sessionDateObj >= startOfMonth && sessionDateObj < nextMonth;
    });

    return filteredSessions.length;
  } catch (error) {
    console.error('Error filtering sessions by month:', error);
    return 0;
  }
};

export const getEffectiveDays = (
  attendance: { status: string; date: string }[],
  totalSessions: number,
  useAttendanceBased: boolean
) => {
  if (useAttendanceBased) {
    return getEffectiveAttendanceDays(attendance);
  }
  return totalSessions;
};

export const getTotalSessionsForGroups = (
  userGroups: any[],
  groupIds: string[],
  selectedMonth: string
): number => {
  let total = 0;
  for (const groupId of groupIds) {
    const group = userGroups.find(
      (g) => g.workspace_user_groups?.id === groupId
    );
    if (group) {
      const sessionsArray = group.workspace_user_groups?.sessions || [];
      total += getSessionsForMonth(sessionsArray, selectedMonth);
    }
  }
  return total;
};
