import {
  getCoverageMonths,
  getMonthStartDate,
  parseLocalCalendarDate,
} from './civil-month';
export type SubscriptionCoverageInvoice = {
  created_at?: string | null;
  group_id?: string;
  valid_until?: string | null;
  covered_months?: string[] | null;
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
  if (invoice?.covered_months != null)
    return invoice.covered_months.some(
      (month) => month.slice(0, 7) === selectedMonth
    );
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
  latestInvoices.some(
    (invoice) =>
      invoice.group_id === groupId &&
      isSubscriptionMonthCoveredByInvoice(selectedMonth, invoice)
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
