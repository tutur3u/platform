'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updatePeriodicReport } from '@tuturuuu/internal-api/reports';
import { toast } from '@tuturuuu/ui/sonner';
import { reportMonthBounds } from '@tuturuuu/users-core/features/reports/report-month';
import { useTranslations } from 'next-intl';

/**
 * Saves only the month a report covers (its period). The server keeps the
 * review decision for a period-only change, since parents never see it.
 */
export function useSetReportMonth(wsId: string, onSaved?: () => void) {
  const t = useTranslations('ws-reports');
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      reportId,
      month,
    }: {
      reportId: string;
      month: string;
    }) => {
      const { start, end } = reportMonthBounds(month);
      const response = await updatePeriodicReport(wsId, reportId, {
        period_start: start,
        period_end: end,
      });
      if (response?.success !== true) throw new Error(t('failed_save_report'));
    },
    onSuccess: async () => {
      toast.success(t('report_month_saved'));
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['periodic-reports', wsId],
        }),
        queryClient.invalidateQueries({ queryKey: ['ws', wsId, 'group'] }),
      ]);
      onSaved?.();
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : t('failed_save_report')
      ),
  });
}
