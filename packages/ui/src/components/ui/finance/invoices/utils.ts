import type { Database } from '@tuturuuu/types';

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

export type WorkspaceUserGroup =
  Database['public']['Tables']['workspace_user_groups']['Row'];

export type UserGroup = {
  workspace_user_groups: WorkspaceUserGroup | null;
};

type Invoice = {
  group_id?: string;
  valid_until?: string | null;
};

const MONTH_VALUE_PATTERN = /^(\d{4})-(\d{2})$/;
const DATE_VALUE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export const parseLocalCalendarDate = (
  value: string | Date | null | undefined
): Date => {
  if (!value) {
    return new Date(Number.NaN);
  }

  if (value instanceof Date) {
    return new Date(value.getTime());
  }

  const monthMatch = MONTH_VALUE_PATTERN.exec(value);
  if (monthMatch) {
    const [, year, month] = monthMatch;
    return new Date(Number(year), Number(month) - 1, 1);
  }

  const dateMatch = DATE_VALUE_PATTERN.exec(value);
  if (dateMatch) {
    const [, year, month, day] = dateMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  return new Date(value);
};

export const getMonthStartDate = (
  value: string | Date | null | undefined
): Date => {
  const date = parseLocalCalendarDate(value);
  if (Number.isNaN(date.getTime())) {
    return date;
  }

  return new Date(date.getFullYear(), date.getMonth(), 1);
};

export const formatMonthValue = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

export const formatMonthLabel = (month: string, locale: string): string => {
  const date = getMonthStartDate(month);
  if (Number.isNaN(date.getTime())) {
    return month;
  }

  return date.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
  });
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
    const startOfMonth = getMonthStartDate(month);
    const nextMonth = new Date(startOfMonth);
    nextMonth.setMonth(nextMonth.getMonth() + 1);

    const filteredSessions = sessionsArray.filter((sessionDate) => {
      if (!sessionDate) return false;
      const sessionDateObj = parseLocalCalendarDate(sessionDate);
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
    const endOfMonth = getMonthStartDate(month);
    endOfMonth.setMonth(endOfMonth.getMonth() + 1);

    const filteredSessions = sessionsArray.filter((sessionDate) => {
      if (!sessionDate) return false;
      const sessionDateObj = parseLocalCalendarDate(sessionDate);
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

/** Date range (earliest start, latest end) for selected groups. */
export type GroupsDateRange = {
  earliestStart: Date | null;
  latestEnd: Date | null;
};

export const getGroupsDateRange = (
  userGroups: UserGroup[],
  groupIds: string[]
): GroupsDateRange => {
  if (groupIds.length === 0) return { earliestStart: null, latestEnd: null };
  const selectedGroupsData = userGroups.filter((g) =>
    groupIds.includes(g.workspace_user_groups?.id || '')
  );
  if (selectedGroupsData.length === 0)
    return { earliestStart: null, latestEnd: null };

  let earliestStart: Date | null = null;
  let latestEnd: Date | null = null;

  for (const selectedGroupItem of selectedGroupsData) {
    const group = selectedGroupItem.workspace_user_groups;
    if (!group) continue;

    const startDate = group.starting_date
      ? parseLocalCalendarDate(group.starting_date)
      : null;
    const endDate = group.ending_date
      ? parseLocalCalendarDate(group.ending_date)
      : null;

    if (startDate && (!earliestStart || startDate < earliestStart))
      earliestStart = startDate;
    if (endDate && (!latestEnd || endDate > latestEnd)) latestEnd = endDate;
  }

  return { earliestStart, latestEnd };
};

export type AvailableMonthOption = {
  value: string;
  label: string;
  isPaid: boolean;
};

export const getAvailableMonths = (
  userGroups: UserGroup[],
  groupIds: string[],
  latestInvoices: { group_id?: string; valid_until?: string | null }[],
  locale: string,
  selectedMonthFallback: string | null = null
): AvailableMonthOption[] => {
  if (groupIds.length === 0) return [];
  const { earliestStart, latestEnd } = getGroupsDateRange(userGroups, groupIds);
  if (!earliestStart) return [];

  const resolvedLatestEnd = latestEnd
    ? latestEnd
    : selectedMonthFallback
      ? getMonthStartDate(selectedMonthFallback)
      : (() => {
          const d = new Date();
          d.setDate(1);
          return d;
        })();

  const months: AvailableMonthOption[] = [];
  const currentDate = new Date(earliestStart);
  currentDate.setDate(1);
  const normalizedLatestEnd = new Date(resolvedLatestEnd);
  normalizedLatestEnd.setDate(1);

  while (currentDate <= normalizedLatestEnd) {
    const value = formatMonthValue(currentDate);
    const label = formatMonthLabel(value, locale);
    const itemMonthStart = new Date(currentDate);
    itemMonthStart.setDate(1);

    const isPaid = groupIds.every((groupId) => {
      const latestInvoice = latestInvoices.find(
        (inv) => inv.group_id === groupId
      );
      if (!latestInvoice?.valid_until) return false;
      const validUntilMonthStart = getMonthStartDate(latestInvoice.valid_until);
      return itemMonthStart < validUntilMonthStart;
    });

    months.push({ value, label, isPaid });
    currentDate.setMonth(currentDate.getMonth() + 1);
  }

  return months;
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
        ? parseLocalCalendarDate(latestInvoice.valid_until)
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

/** Days before valid_until to consider "expiring soon" */
const EXPIRING_SOON_DAYS = 14;

export type GroupPaymentStatus = 'active' | 'expiringSoon' | 'expired';

export function getGroupPaymentStatus(
  group: WorkspaceUserGroup | null,
  latestInvoice:
    | { valid_until?: string | null; created_at?: string | null }
    | undefined
): GroupPaymentStatus {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (!group) return 'active';

  const endDate = group.ending_date
    ? parseLocalCalendarDate(group.ending_date)
    : null;
  if (endDate) {
    endDate.setHours(0, 0, 0, 0);
    if (today > endDate) return 'expired';
  }

  const validUntil = latestInvoice?.valid_until
    ? parseLocalCalendarDate(latestInvoice.valid_until)
    : null;
  if (validUntil) {
    validUntil.setHours(0, 0, 0, 0);
    const daysUntilExpiry = Math.ceil(
      (validUntil.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysUntilExpiry < 0) return 'expired';
    if (daysUntilExpiry <= EXPIRING_SOON_DAYS) return 'expiringSoon';
  }

  return 'active';
}
