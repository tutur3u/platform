'use client';

import { type QueryClient, useMutation } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import type { UserReport } from './use-report-mutations';

/** Shared approval field payloads reused by both auto-approve and explicit approve. */
export function buildApproveFields() {
  return {
    report_approval_status: 'APPROVED' as const,
    approved_at: new Date().toISOString(),
    rejected_by: null,
    rejected_at: null,
    rejection_reason: null,
  };
}

function buildRejectFields(reason: string) {
  return {
    report_approval_status: 'REJECTED' as const,
    rejected_at: new Date().toISOString(),
    rejection_reason: reason,
    approved_by: null,
    approved_at: null,
  };
}

/** Create a function that invalidates all report-related queries. */
export function createReportQueryInvalidator(
  queryClient: QueryClient,
  wsId: string,
  report: UserReport
) {
  return async () => {
    if (!report.id) return;
    const promises = [
      queryClient.invalidateQueries({
        queryKey: ['ws', wsId, 'report', report.id, 'logs'],
      }),
      queryClient.invalidateQueries({
        queryKey: ['ws', wsId, 'approvals', 'reports'],
      }),
    ];
    if (report.group_id && report.user_id) {
      promises.push(
        queryClient.invalidateQueries({
          queryKey: [
            'ws',
            wsId,
            'group',
            report.group_id,
            'user',
            report.user_id,
            'report',
            report.id,
          ],
        }),
        queryClient.invalidateQueries({
          queryKey: [
            'ws',
            wsId,
            'group',
            report.group_id,
            'user',
            report.user_id,
            'reports',
          ],
        })
      );
    }
    await Promise.all(promises);
  };
}

interface UseReportApprovalOptions {
  report: UserReport;
  invalidateReportQueries: () => Promise<void>;
}

export function useReportApproval({
  report,
  invalidateReportQueries,
}: UseReportApprovalOptions) {
  const t = useTranslations();
  const supabase = createClient();

  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!report.id) throw new Error('Missing report id');
      const { error } = await supabase
        .from('external_user_monthly_reports')
        .update(buildApproveFields())
        .eq('id', report.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success(t('ws-reports.report_approved'));
      await invalidateReportQueries();
    },
    onError: (err) => {
      toast.error(
        err instanceof Error
          ? err.message
          : t('ws-reports.failed_approve_report')
      );
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (reason: string) => {
      if (!report.id) throw new Error('Missing report id');
      const { error } = await supabase
        .from('external_user_monthly_reports')
        .update(buildRejectFields(reason))
        .eq('id', report.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success(t('ws-reports.report_rejected'));
      await invalidateReportQueries();
    },
    onError: (err) => {
      toast.error(
        err instanceof Error
          ? err.message
          : t('ws-reports.failed_reject_report')
      );
    },
  });

  return { approveMutation, rejectMutation };
}
