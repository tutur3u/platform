'use client';

import { type QueryClient, useMutation } from '@tanstack/react-query';
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
    // Invalidate group-level and workspace-level status summaries
    promises.push(
      queryClient.invalidateQueries({
        queryKey: ['ws', wsId, 'group-report-status-summary'],
      })
    );
    if (report.group_id) {
      promises.push(
        queryClient.invalidateQueries({
          queryKey: ['ws', wsId, 'group', report.group_id, 'reports-dashboard'],
        }),
        queryClient.invalidateQueries({
          queryKey: [
            'ws',
            wsId,
            'group',
            report.group_id,
            'user-report-status-summary',
          ],
        })
      );
    }
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
  wsId: string;
  report: UserReport;
  invalidateReportQueries: () => Promise<void>;
}

export function useReportApproval({
  wsId,
  report,
  invalidateReportQueries,
}: UseReportApprovalOptions) {
  const t = useTranslations();

  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!report.id) throw new Error('Missing report id');

      const response = await fetch(
        `/api/v1/workspaces/${wsId}/users/approvals`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'approve',
            kind: 'reports',
            itemId: report.id,
          }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || t('ws-reports.failed_approve_report'));
      }
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

      const response = await fetch(
        `/api/v1/workspaces/${wsId}/users/approvals`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'reject',
            kind: 'reports',
            itemId: report.id,
            reason,
          }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || t('ws-reports.failed_reject_report'));
      }
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
