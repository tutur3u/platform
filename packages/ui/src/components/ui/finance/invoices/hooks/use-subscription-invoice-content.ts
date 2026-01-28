import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import type { SelectedProductItem, UserGroupProducts } from '../types';
import { getAttendanceStats, getTotalSessionsForGroups } from '../utils';

interface UseSubscriptionInvoiceContentProps {
  enabled: boolean;
  selectedGroupIds: string[];
  selectedMonth: string;
  userGroups: any[];
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
}: UseSubscriptionInvoiceContentProps) {
  const t = useTranslations();
  useEffect(() => {
    if (
      !enabled ||
      (selectedGroupIds.length === 0 &&
        subscriptionSelectedProducts.length === 0)
    ) {
      return;
    }

    const formatMonth = (monthStr: string) =>
      new Date(`${monthStr}-01`).toLocaleDateString(locale, {
        year: 'numeric',
        month: 'long',
      });

    // Group by month ranges
    const rangeToGroups = new Map<string, string[]>();

    selectedGroupIds.forEach((groupId) => {
      const group = userGroups.find(
        (g) => g.workspace_user_groups?.id === groupId
      );
      if (!group) return;

      const groupName = group.workspace_user_groups?.name || 'Unknown Group';
      const latestInvoice = latestSubscriptionInvoices.find(
        (inv) => inv.group_id === groupId
      );

      const startMonth = latestInvoice?.valid_until
        ? latestInvoice.valid_until.slice(0, 7)
        : null;

      const endMonth = selectedMonth;

      let rangeLabel = '';
      if (startMonth && startMonth < endMonth) {
        // Range from startMonth to endMonth
        rangeLabel = `${formatMonth(startMonth)} - ${formatMonth(endMonth)}`;
      } else {
        // Single month
        rangeLabel = formatMonth(endMonth);
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
          : t('ws-invoices.subscription_invoice_for_groups_month', {
              groupNames,
              monthName: rangeLabel,
              default: `Subscription invoice for groups: ${groupNames} - ${rangeLabel}`,
            })
      );
    } else {
      contentParts.push(t('ws-invoices.subscription_invoice_combined_title'));
      rangeToGroups.forEach((names, rangeLabel) => {
        contentParts.push(`- ${names.join(', ')}: ${rangeLabel}`);
      });
    }

    let autoNotes: string | null = null;
    if (selectedGroupIds.length > 0 && userAttendance.length > 0) {
      const filteredAttendance = userAttendance.filter((a) => {
        const latestInvoice = latestSubscriptionInvoices.find(
          (inv) => inv.group_id === a.group_id
        );
        if (!latestInvoice || !latestInvoice.valid_until) return true;
        const validUntil = new Date(latestInvoice.valid_until);
        const attendanceDate = new Date(a.date);
        return attendanceDate >= validUntil;
      });

      const attendanceStats = getAttendanceStats(filteredAttendance);
      const attendanceDays = attendanceStats.present + attendanceStats.late;
      const totalSessions = getTotalSessionsForGroups(
        userGroups,
        selectedGroupIds,
        selectedMonth,
        latestSubscriptionInvoices
      );
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

    onContentChange(contentParts.join('\n'));

    if (autoNotes && !isSelectedMonthPaid) {
      onNotesChange(autoNotes);
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
    onContentChange,
    onNotesChange,
    latestSubscriptionInvoices,
  ]);
}
