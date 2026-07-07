import type { Database } from '@tuturuuu/types';
import {
  formatMonthLabel,
  formatMonthValue,
  getCoverageMonths,
  getCurrentMonthStartDate,
  getMonthStartDate,
  parseLocalCalendarDate,
} from './civil-month';

export {
  addMonthsToMonthValue,
  formatCoverageRangeLabel,
  formatMonthLabel,
  formatMonthValue,
  getCoverageEndMonthValue,
  getCoverageMonths,
  getCoverageValidUntilMonthValue,
  getCurrentBillingDate,
  getCurrentMonthStartDate,
  getCurrentMonthValue,
  getMonthStartDate,
  MAX_PREPAID_MONTH_COUNT,
  PREPAID_MONTH_OPTION_HORIZON,
  parseLocalCalendarDate,
  resolveBillingTimezone,
} from './civil-month';

type AttendanceRecord = {
  status: string;
  date: string;
  group_id?: string;
};

type AttendanceStats = {
  present: number;
  late: number;
  absent: number;
  total: number;
};

export type WorkspaceUserGroup =
  Database['public']['Tables']['workspace_user_groups']['Row'] & {
    sessions?: string[] | null;
  };

export type UserGroup = {
  workspace_user_groups: WorkspaceUserGroup | null;
};

export type SubscriptionCoverageInvoice = {
  created_at?: string | null;
  group_id?: string;
  valid_until?: string | null;
};

export type BillableSession = {
  date: string;
  groupId: string;
  groupName: string;
};

type SubscriptionAttendanceDisplayData = {
  displayAttendance: AttendanceRecord[];
  displaySessions: BillableSession[];
  attendanceStats: AttendanceStats;
  totalSessions: number;
  attendanceRate: number;
};

type FinanceCategoryLinkedItem = {
  product?: {
    finance_category_id?: string | null;
  } | null;
};

export const getLinkedFinanceCategorySelection = (
  items: FinanceCategoryLinkedItem[]
) => {
  const linkedCategoryIds = [
    ...new Set(
      items
        .map((item) => item.product?.finance_category_id)
        .filter((value): value is string => Boolean(value))
    ),
  ];

  return {
    categoryId:
      linkedCategoryIds.length === 1 ? (linkedCategoryIds[0] ?? null) : null,
    hasMixedCategories: linkedCategoryIds.length > 1,
    hasSingleCategory: linkedCategoryIds.length === 1,
  };
};

export const resolveSubscriptionInvoiceCategoryId = ({
  defaultCategoryId,
  items,
}: {
  defaultCategoryId?: string | null;
  items: FinanceCategoryLinkedItem[];
}) => {
  const linkedFinanceCategorySelection =
    getLinkedFinanceCategorySelection(items);

  if (linkedFinanceCategorySelection.hasSingleCategory) {
    return linkedFinanceCategorySelection.categoryId ?? '';
  }

  if (linkedFinanceCategorySelection.hasMixedCategories) {
    return '';
  }

  return defaultCategoryId ?? '';
};

const getComparableTimestamp = (value: string | null | undefined): number => {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
};

const getComparableValidUntilTimestamp = (
  invoice: SubscriptionCoverageInvoice
): number => {
  const validUntil = parseLocalCalendarDate(invoice.valid_until);
  return Number.isNaN(validUntil.getTime()) ? 0 : validUntil.getTime();
};

export const getSubscriptionCoverageInvoiceForGroup = (
  latestInvoices: SubscriptionCoverageInvoice[],
  groupId: string
): SubscriptionCoverageInvoice | undefined =>
  latestInvoices
    .filter((invoice) => invoice.group_id === groupId)
    .filter((invoice) => getComparableValidUntilTimestamp(invoice) > 0)
    .sort((a, b) => {
      const validUntilDiff =
        getComparableValidUntilTimestamp(b) -
        getComparableValidUntilTimestamp(a);
      if (validUntilDiff !== 0) return validUntilDiff;

      return (
        getComparableTimestamp(b.created_at) -
        getComparableTimestamp(a.created_at)
      );
    })[0];

export const isSubscriptionMonthCoveredByInvoice = (
  selectedMonth: string,
  invoice: SubscriptionCoverageInvoice | null | undefined
): boolean => {
  if (!invoice?.valid_until) return false;

  const selectedMonthStart = getMonthStartDate(selectedMonth);
  const validUntilMonthStart = getMonthStartDate(invoice.valid_until);

  if (
    Number.isNaN(selectedMonthStart.getTime()) ||
    Number.isNaN(validUntilMonthStart.getTime())
  ) {
    return false;
  }

  return selectedMonthStart < validUntilMonthStart;
};

export const isSubscriptionMonthPaidForGroup = (
  groupId: string,
  selectedMonth: string,
  latestInvoices: SubscriptionCoverageInvoice[]
): boolean =>
  isSubscriptionMonthCoveredByInvoice(
    selectedMonth,
    getSubscriptionCoverageInvoiceForGroup(latestInvoices, groupId)
  );

export const isSubscriptionRangePaidForGroup = (
  groupId: string,
  selectedMonth: string,
  prepaidMonthCount: number,
  latestInvoices: SubscriptionCoverageInvoice[]
): boolean => {
  const coverageMonths = getCoverageMonths(selectedMonth, prepaidMonthCount);
  if (coverageMonths.length === 0) return false;

  return coverageMonths.every((month) =>
    isSubscriptionMonthPaidForGroup(groupId, month, latestInvoices)
  );
};

export const isSubscriptionRangeFullyPaidForGroups = (
  groupIds: string[],
  selectedMonth: string,
  prepaidMonthCount: number,
  latestInvoices: SubscriptionCoverageInvoice[]
): boolean => {
  if (groupIds.length === 0) return false;

  return groupIds.every((groupId) =>
    isSubscriptionRangePaidForGroup(
      groupId,
      selectedMonth,
      prepaidMonthCount,
      latestInvoices
    )
  );
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

const getGroupValidUntilDate = (
  latestInvoices: SubscriptionCoverageInvoice[],
  groupId: string
): Date | null => {
  const latestInvoice = getSubscriptionCoverageInvoiceForGroup(
    latestInvoices,
    groupId
  );
  if (!latestInvoice?.valid_until) return null;

  const validUntil = parseLocalCalendarDate(latestInvoice.valid_until);
  return Number.isNaN(validUntil.getTime()) ? null : validUntil;
};

const isDateInMonth = (date: Date, month: string): boolean => {
  if (Number.isNaN(date.getTime())) return false;

  const startOfMonth = getMonthStartDate(month);
  if (Number.isNaN(startOfMonth.getTime())) return false;

  const nextMonth = new Date(startOfMonth);
  nextMonth.setMonth(nextMonth.getMonth() + 1);

  return date >= startOfMonth && date < nextMonth;
};

export const getBillableSessionsForGroups = (
  userGroups: UserGroup[],
  groupIds: string[],
  selectedMonth: string,
  latestInvoices: SubscriptionCoverageInvoice[] = []
): BillableSession[] => {
  if (!selectedMonth || groupIds.length === 0) return [];

  return groupIds.flatMap((groupId) => {
    const group = userGroups.find(
      (candidate) => candidate.workspace_user_groups?.id === groupId
    )?.workspace_user_groups;

    if (!group?.sessions?.length) return [];

    const validUntil = getGroupValidUntilDate(latestInvoices, groupId);

    return group.sessions.flatMap((sessionDate) => {
      if (!sessionDate) return [];

      const parsedDate = parseLocalCalendarDate(sessionDate);
      if (!isDateInMonth(parsedDate, selectedMonth)) return [];
      if (validUntil && parsedDate < validUntil) return [];

      return [
        {
          date: sessionDate,
          groupId: group.id,
          groupName: group.name || 'Unknown Group',
        },
      ];
    });
  });
};

export const getBillableSessionsForGroupsInRange = (
  userGroups: UserGroup[],
  groupIds: string[],
  selectedMonth: string,
  prepaidMonthCount = 1,
  latestInvoices: SubscriptionCoverageInvoice[] = []
): BillableSession[] =>
  getCoverageMonths(selectedMonth, prepaidMonthCount).flatMap((month) =>
    getBillableSessionsForGroups(userGroups, groupIds, month, latestInvoices)
  );

export const getBillableAttendanceRecords = (
  attendance: AttendanceRecord[],
  groupIds: string[],
  selectedMonth: string,
  latestInvoices: SubscriptionCoverageInvoice[] = []
): AttendanceRecord[] => {
  if (!Array.isArray(attendance) || !selectedMonth || groupIds.length === 0) {
    return [];
  }

  return attendance.filter((record) => {
    const groupId = record.group_id;
    if (!groupId || !groupIds.includes(groupId)) return false;

    const attendanceDate = parseLocalCalendarDate(record.date);
    if (!isDateInMonth(attendanceDate, selectedMonth)) return false;

    const validUntil = getGroupValidUntilDate(latestInvoices, groupId);
    return !validUntil || attendanceDate >= validUntil;
  });
};

export const getBillableAttendanceRecordsInRange = (
  attendance: AttendanceRecord[],
  groupIds: string[],
  selectedMonth: string,
  prepaidMonthCount = 1,
  latestInvoices: SubscriptionCoverageInvoice[] = []
): AttendanceRecord[] =>
  getCoverageMonths(selectedMonth, prepaidMonthCount).flatMap((month) =>
    getBillableAttendanceRecords(attendance, groupIds, month, latestInvoices)
  );

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
  } catch {
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

export const getSubscriptionAttendanceDisplayData = ({
  isSelectedMonthPaid,
  billableAttendance,
  billableSessions,
  monthlyAttendance,
  monthlySessions,
}: {
  isSelectedMonthPaid: boolean;
  billableAttendance: AttendanceRecord[];
  billableSessions: BillableSession[];
  monthlyAttendance: AttendanceRecord[];
  monthlySessions: BillableSession[];
}): SubscriptionAttendanceDisplayData => {
  const displayAttendance = isSelectedMonthPaid
    ? monthlyAttendance
    : billableAttendance;
  const displaySessions = isSelectedMonthPaid
    ? monthlySessions
    : billableSessions;
  const attendanceStats = getAttendanceStats(displayAttendance);
  const totalSessions = displaySessions.length;
  const attendanceDays = getEffectiveAttendanceDays(displayAttendance);

  return {
    displayAttendance,
    displaySessions,
    attendanceStats,
    totalSessions,
    attendanceRate:
      totalSessions > 0 ? (attendanceDays / totalSessions) * 100 : 0,
  };
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
  } catch {
    return 0;
  }
};

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
  latestInvoices: SubscriptionCoverageInvoice[],
  locale: string,
  selectedMonthFallback: string | null = null,
  futureMonthHorizon = 0,
  options: {
    now?: Date;
    workspaceTimezone?: string | null;
  } = {}
): AvailableMonthOption[] => {
  if (groupIds.length === 0) return [];
  const { earliestStart, latestEnd } = getGroupsDateRange(userGroups, groupIds);
  if (!earliestStart) return [];

  const currentMonthStart = getCurrentMonthStartDate(
    options.workspaceTimezone,
    options.now
  );
  const futureHorizonEnd = new Date(currentMonthStart);
  futureHorizonEnd.setMonth(
    futureHorizonEnd.getMonth() + Math.max(0, futureMonthHorizon)
  );

  const resolvedLatestEnd = latestEnd
    ? latestEnd
    : selectedMonthFallback
      ? getMonthStartDate(selectedMonthFallback)
      : currentMonthStart;
  const resolvedRangeEnd =
    futureMonthHorizon > 0 && !latestEnd ? futureHorizonEnd : resolvedLatestEnd;

  const months: AvailableMonthOption[] = [];
  const currentDate = new Date(earliestStart);
  currentDate.setDate(1);
  const normalizedLatestEnd = new Date(resolvedRangeEnd);
  normalizedLatestEnd.setDate(1);

  while (currentDate <= normalizedLatestEnd) {
    const value = formatMonthValue(currentDate);
    const label = formatMonthLabel(value, locale);

    const isPaid = groupIds.every((groupId) =>
      isSubscriptionMonthPaidForGroup(groupId, value, latestInvoices)
    );

    months.push({ value, label, isPaid });
    currentDate.setMonth(currentDate.getMonth() + 1);
  }

  return months;
};

export const getTotalSessionsForGroups = (
  userGroups: UserGroup[],
  groupIds: string[],
  selectedMonth: string,
  latestInvoices: SubscriptionCoverageInvoice[] = []
): number => {
  return getBillableSessionsForGroups(
    userGroups,
    groupIds,
    selectedMonth,
    latestInvoices
  ).length;
};

export const getBillableQuantityForGroupRange = ({
  groupId,
  latestInvoices,
  now = new Date(),
  prepaidMonthCount = 1,
  selectedMonth,
  workspaceTimezone,
  useAttendanceBased,
  userAttendance,
  userGroups,
}: {
  groupId: string;
  latestInvoices?: SubscriptionCoverageInvoice[];
  now?: Date;
  prepaidMonthCount?: number;
  selectedMonth: string;
  workspaceTimezone?: string | null;
  useAttendanceBased: boolean;
  userAttendance: AttendanceRecord[];
  userGroups: UserGroup[];
}): number => {
  const currentMonthStart = getCurrentMonthStartDate(workspaceTimezone, now);
  const coverageMonths = getCoverageMonths(selectedMonth, prepaidMonthCount);

  return coverageMonths.reduce((total, month) => {
    if (isSubscriptionMonthPaidForGroup(groupId, month, latestInvoices ?? [])) {
      return total;
    }

    const monthStart = getMonthStartDate(month);
    const useScheduledSessions =
      !useAttendanceBased ||
      (!Number.isNaN(monthStart.getTime()) &&
        !Number.isNaN(currentMonthStart.getTime()) &&
        monthStart > currentMonthStart);

    if (useScheduledSessions) {
      return (
        total +
        getBillableSessionsForGroups(
          userGroups,
          [groupId],
          month,
          latestInvoices
        ).length
      );
    }

    return (
      total +
      getEffectiveAttendanceDays(
        getBillableAttendanceRecords(
          userAttendance,
          [groupId],
          month,
          latestInvoices
        )
      )
    );
  }, 0);
};

export const getBillableQuantityMapForGroupsRange = ({
  groupIds,
  latestInvoices,
  now,
  prepaidMonthCount = 1,
  selectedMonth,
  workspaceTimezone,
  useAttendanceBased,
  userAttendance,
  userGroups,
}: {
  groupIds: string[];
  latestInvoices?: SubscriptionCoverageInvoice[];
  now?: Date;
  prepaidMonthCount?: number;
  selectedMonth: string;
  workspaceTimezone?: string | null;
  useAttendanceBased: boolean;
  userAttendance: AttendanceRecord[];
  userGroups: UserGroup[];
}): Record<string, number> =>
  Object.fromEntries(
    groupIds.map((groupId) => [
      groupId,
      getBillableQuantityForGroupRange({
        groupId,
        latestInvoices,
        now,
        prepaidMonthCount,
        selectedMonth,
        workspaceTimezone,
        useAttendanceBased,
        userAttendance,
        userGroups,
      }),
    ])
  );

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
