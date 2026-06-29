import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import type { SelectedProductItem, UserGroupProducts } from '../types';
import type { UserGroup } from '../utils';
import {
  formatCoverageRangeLabel,
  formatMonthLabel,
  getAttendanceStats,
  getBillableAttendanceRecordsInRange,
  getBillableSessionsForGroupsInRange,
  getCoverageEndMonthValue,
  getCoverageMonths,
  getSubscriptionCoverageInvoiceForGroup,
  isSubscriptionMonthPaidForGroup,
} from '../utils';

interface UseSubscriptionInvoiceContentProps {
  enabled: boolean;
  selectedGroupIds: string[];
  selectedMonth: string;
  userGroups: UserGroup[];
  groupProducts: UserGroupProducts[];
  subscriptionSelectedProducts: SelectedProductItem[];
  userAttendance: { status: string; date: string; group_id?: string }[];
  latestSubscriptionInvoices: {
    group_id?: string;
    valid_until?: string | null;
  }[];
  isSelectedMonthPaid: boolean;
  locale: string;
  onContentChange: (content: string) => void;
  onNotesChange: (notes: string) => void;
  prepaidMonthCount?: number;
}

export function useSubscriptionInvoiceContent({
  enabled,
  selectedGroupIds,
  selectedMonth,
  userGroups,
  groupProducts,
  subscriptionSelectedProducts,
  userAttendance,
  latestSubscriptionInvoices,
  isSelectedMonthPaid,
  locale,
  onContentChange,
  onNotesChange,
  prepaidMonthCount = 1,
}: UseSubscriptionInvoiceContentProps): void {
  const t = useTranslations();
  const contentCallbackRef = useRef(onContentChange);
  const notesCallbackRef = useRef(onNotesChange);

  useEffect(() => {
    contentCallbackRef.current = onContentChange;
    notesCallbackRef.current = onNotesChange;
  }, [onContentChange, onNotesChange]);

  useEffect(() => {
    if (
      !enabled ||
      (selectedGroupIds.length === 0 &&
        subscriptionSelectedProducts.length === 0)
    ) {
      return;
    }

    const formatMonth = (monthStr: string) =>
      formatMonthLabel(monthStr, locale);

    const coverageMonths = getCoverageMonths(selectedMonth, prepaidMonthCount);
    const coverageEndMonth = getCoverageEndMonthValue(
      selectedMonth,
      prepaidMonthCount
    );
    const fallbackRangeLabel = formatCoverageRangeLabel({
      locale,
      prepaidMonthCount,
      selectedMonth,
    });

    // Group by unpaid month ranges.
    const rangeToGroups = new Map<string, string[]>();

    selectedGroupIds.forEach((groupId) => {
      const group = userGroups.find(
        (g) => g.workspace_user_groups?.id === groupId
      );
      if (!group) return;

      const groupName = group.workspace_user_groups?.name || 'Unknown Group';
      const latestInvoice = getSubscriptionCoverageInvoiceForGroup(
        latestSubscriptionInvoices,
        groupId
      );
      const unpaidMonths = coverageMonths.filter(
        (month) =>
          !isSubscriptionMonthPaidForGroup(
            groupId,
            month,
            latestSubscriptionInvoices
          )
      );

      const startMonth =
        unpaidMonths[0] ??
        latestInvoice?.valid_until?.slice(0, 7) ??
        selectedMonth;
      const endMonth =
        unpaidMonths[unpaidMonths.length - 1] ?? coverageEndMonth;

      let rangeLabel = '';
      if (startMonth && startMonth < endMonth) {
        // Range from startMonth to endMonth
        rangeLabel = `${formatMonth(startMonth)} - ${formatMonth(endMonth)}`;
      } else {
        // Single month
        rangeLabel =
          unpaidMonths.length === 0
            ? fallbackRangeLabel
            : formatMonth(endMonth);
      }

      if (!rangeToGroups.has(rangeLabel)) {
        rangeToGroups.set(rangeLabel, []);
      }
      rangeToGroups.get(rangeLabel)!.push(groupName);
    });

    const contentParts: string[] = [];

    if (rangeToGroups.size === 1) {
      const [rangeLabel, names] = Array.from(rangeToGroups.entries())[0]!;
      const groupNames = names.join(', ');

      contentParts.push(
        selectedGroupIds.length === 1
          ? t('ws-invoices.subscription_invoice_for_group_month', {
              groupName: groupNames,
              monthName: rangeLabel,
            })
          : t.has('ws-invoices.subscription_invoice_for_groups_month')
            ? t('ws-invoices.subscription_invoice_for_groups_month', {
                groupNames,
                monthName: rangeLabel,
              })
            : `Subscription invoice for groups: ${groupNames} - ${rangeLabel}`
      );
    } else {
      contentParts.push(t('ws-invoices.subscription_invoice_combined_title'));
      rangeToGroups.forEach((names, rangeLabel) => {
        contentParts.push(`- ${names.join(', ')}: ${rangeLabel}`);
      });
    }

    let autoNotes: string | null = null;
    if (selectedGroupIds.length > 0) {
      const filteredAttendance = getBillableAttendanceRecordsInRange(
        userAttendance,
        selectedGroupIds,
        selectedMonth,
        prepaidMonthCount,
        latestSubscriptionInvoices
      );
      const attendanceStats = getAttendanceStats(filteredAttendance);
      const attendanceDays = attendanceStats.present + attendanceStats.late;
      const totalSessions = getBillableSessionsForGroupsInRange(
        userGroups,
        selectedGroupIds,
        selectedMonth,
        prepaidMonthCount,
        latestSubscriptionInvoices
      ).length;
      autoNotes = t('ws-invoices.attendance_summary_note', {
        attended: attendanceDays,
        total: totalSessions,
        present: attendanceStats.present,
        late: attendanceStats.late,
        absent: attendanceStats.absent,
      });
    }

    if (subscriptionSelectedProducts.length > 0) {
      const groupProductIds = (groupProducts || [])
        .map((item) => item.workspace_products?.id)
        .filter(Boolean);

      const additionalProductCount = subscriptionSelectedProducts.filter(
        (item) => !groupProductIds.includes(item.product.id)
      ).length;

      if (additionalProductCount > 0) {
        contentParts.push(
          t('ws-invoices.additional_products_count', {
            count: additionalProductCount,
          })
        );
      }
    }

    contentCallbackRef.current(contentParts.join('\n'));

    if (autoNotes && !isSelectedMonthPaid) {
      notesCallbackRef.current(autoNotes);
    }
  }, [
    enabled,
    selectedGroupIds,
    selectedMonth,
    userGroups,
    groupProducts,
    subscriptionSelectedProducts,
    userAttendance,
    isSelectedMonthPaid,
    locale,
    t,
    latestSubscriptionInvoices,
    prepaidMonthCount,
  ]);
}
