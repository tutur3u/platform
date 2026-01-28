type AttendanceRecord = {
  status: string;
  date: string;
};

type AttendanceStats = {
  present: number;
  late: number;
  absent: number;
  total: number;
};

export type WorkspaceUserGroup = {
  id: string;
  name?: string | null;
  sessions?: string[] | null;
};

export type UserGroup = {
  workspace_user_groups?: WorkspaceUserGroup | null;
};

type Invoice = {
  group_id?: string;
  valid_until?: string | null;
};

export const getAttendanceStats = (
  attendance: AttendanceRecord[]
): AttendanceStats => {
  if (!attendance || !Array.isArray(attendance)) {
    return { present: 0, late: 0, absent: 0, total: 0 };
  }

  return attendance.reduce<AttendanceStats>(
    (stats, record) => {
      const status = record.status?.toUpperCase();
      switch (status) {
        case 'PRESENT':
          stats.present++;
          stats.total++;
          break;
        case 'LATE':
          stats.late++;
          stats.total++;
          break;
        case 'ABSENT':
          stats.absent++;
          stats.total++;
          break;
        default:
          break;
      }
      return stats;
    },
    { present: 0, late: 0, absent: 0, total: 0 }
  );
};

export const getEffectiveAttendanceDays = (
  attendance: AttendanceRecord[]
): number => {
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
  attendance: AttendanceRecord[],
  totalSessions: number,
  useAttendanceBased: boolean
): number => {
  if (useAttendanceBased) {
    return getEffectiveAttendanceDays(attendance);
  }
  return totalSessions;
};

export const getSessionsUntilMonth = (
  sessionsArray: string[] | null,
  month: string,
  startFromDate: Date | null = null
): number => {
  if (!Array.isArray(sessionsArray) || !month) return 0;

  try {
    const endOfMonth = new Date(`${month}-01`);
    endOfMonth.setMonth(endOfMonth.getMonth() + 1);

    const filteredSessions = sessionsArray.filter((sessionDate) => {
      if (!sessionDate) return false;
      const sessionDateObj = new Date(sessionDate);
      if (Number.isNaN(sessionDateObj.getTime())) return false;

      const isBeforeEnd = sessionDateObj < endOfMonth;
      const isAfterStart = startFromDate
        ? sessionDateObj >= startFromDate
        : true;

      return isBeforeEnd && isAfterStart;
    });

    return filteredSessions.length;
  } catch (error) {
    console.error('Error filtering sessions until month:', error);
    return 0;
  }
};

export const getTotalSessionsForGroups = (
  userGroups: UserGroup[],
  groupIds: string[],
  selectedMonth: string,
  latestInvoices: Invoice[] = []
): number => {
  let total = 0;
  for (const groupId of groupIds) {
    const group = userGroups.find(
      (g) => g.workspace_user_groups?.id === groupId
    );
    if (group) {
      const sessionsArray = group.workspace_user_groups?.sessions || [];
      const latestInvoice = latestInvoices.find(
        (inv) => inv.group_id === groupId
      );
      const validUntil = latestInvoice?.valid_until
        ? new Date(latestInvoice.valid_until)
        : null;

      // If we have a valid_until date, we should count sessions from that date onwards.
      // If not, we fall back to the selected month only (standard behavior).
      if (validUntil) {
        total += getSessionsUntilMonth(
          sessionsArray,
          selectedMonth,
          validUntil
        );
      } else {
        total += getSessionsForMonth(sessionsArray, selectedMonth);
      }
    }
  }
  return total;
};
