'use client';

import { AlertTriangle, FileText } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useFinanceRoutePrefix } from '../../finance-route-context';
import { useInvoiceAttendanceConfig, usePendingInvoices } from '../hooks';
import { buildPendingInvoiceCreateUrl } from '../pending-columns';
import { getPendingInvoiceCoverage } from '../pending-invoice-coverage';

const MAX_LISTED_CLASSES = 5;

interface StandardInvoiceTuitionWarningProps {
  userId: string;
  wsId: string;
}

/**
 * A standard invoice has no class link and no tuition months, so it can never
 * settle owed tuition. Shown for a customer with pending tuition, it points to
 * the class invoice flow pre-filled with the owed range.
 */
export function StandardInvoiceTuitionWarning({
  userId,
  wsId,
}: StandardInvoiceTuitionWarningProps) {
  const t = useTranslations();
  const financePrefix = useFinanceRoutePrefix();
  const { data } = usePendingInvoices(wsId, {
    userIds: userId ? [userId] : [],
    pageSize: MAX_LISTED_CLASSES,
    enabled: Boolean(userId),
  });

  const { data: useAttendanceBased = true } = useInvoiceAttendanceConfig(wsId, {
    enabled: Boolean(userId),
  });

  const rows = (data?.data ?? []).filter(
    (row) => row.user_id === userId && Array.isArray(row.months_owed)
  );
  if (!userId || rows.length === 0) return null;

  return (
    <div
      role="alert"
      className="rounded-lg border border-dynamic-orange/30 bg-dynamic-orange/5 p-3"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-dynamic-orange" />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="space-y-1">
            <p className="font-medium text-sm">
              {t('ws-invoices.standard_invoice_tuition_owed_title')}
            </p>
            <p className="text-muted-foreground text-sm">
              {t('ws-invoices.standard_invoice_tuition_owed_description')}
            </p>
          </div>
          <ul className="space-y-2">
            {rows.map((row) => {
              const monthsOwed = row.months_owed as string[];
              const groupIds =
                row.group_ids ?? (row.group_id ? [row.group_id] : []);
              const { month, lastMonth } = getPendingInvoiceCoverage(
                monthsOwed,
                { singleMonth: groupIds.length > 1 }
              );
              const range =
                lastMonth !== month ? `${month} → ${lastMonth}` : month;
              return (
                <li
                  key={`${row.group_id ?? row.user_id}-${month}`}
                  className="flex flex-wrap items-center justify-between gap-2"
                >
                  <span className="text-sm">
                    {[row.group_name, range].filter(Boolean).join(' · ')}
                  </span>
                  <Button variant="outline" size="sm" asChild>
                    <Link
                      href={buildPendingInvoiceCreateUrl({
                        attendanceDays: row.attendance_days,
                        financePrefix,
                        groupIds,
                        monthsOwed,
                        potentialTotal: row.potential_total || 0,
                        useAttendanceBased,
                        userId,
                        wsId,
                      })}
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      {t('ws-invoices.standard_invoice_tuition_owed_action')}
                    </Link>
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
