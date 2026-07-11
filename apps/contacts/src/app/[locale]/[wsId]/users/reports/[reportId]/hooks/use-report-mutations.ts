'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { WorkspaceUserReport } from '@tuturuuu/types';
import { toast } from '@tuturuuu/ui/sonner';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  buildApproveFields,
  createReportQueryInvalidator,
  useReportApproval,
} from './use-report-approval';

export type UserReport = Partial<WorkspaceUserReport> & {
  user_name?: string;
  user_archived?: boolean;
  user_archived_until?: string | null;
  user_note?: string | null;
  creator_name?: string;
  group_name?: string;
  report_approval_status?:
    | 'PENDING'
    | 'APPROVED'
    | 'REJECTED'
    | 'SKIPPED'
    | null;
};

export function useReportMutations({
  wsId,
  report,
  isNew,
  userGroupMetrics = [],
  factorEnabled = false,
  scoreCalculationMethod = 'LATEST',
  canApproveReports = false,
}: {
  wsId: string;
  report: UserReport;
  isNew: boolean;
  userGroupMetrics?: Array<{
    id: string;
    is_weighted?: boolean;
    name: string;
    unit: string;
    factor: number;
    value: number | null;
  }>;
  factorEnabled?: boolean;
  scoreCalculationMethod?: 'AVERAGE' | 'LATEST';
  canApproveReports?: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: async (payload: {
      title: string;
      content: string;
      feedback: string;
    }) => {
      if (!report.user_id || !report.group_id)
        throw new Error('Missing user or group');

      let calculatedScores = report.scores;
      let calculatedScore = report.score;

      if (isNew && userGroupMetrics.length > 0) {
        const scores = userGroupMetrics
          .filter(
            (vital) =>
              vital.is_weighted !== false &&
              vital.value !== null &&
              vital.value !== undefined
          )
          .map((vital) => {
            const baseValue = vital.value ?? 0;
            return factorEnabled ? baseValue * (vital.factor ?? 1) : baseValue;
          });

        calculatedScores = scores.length > 0 ? scores : [];
        calculatedScore =
          scores.length > 0
            ? scoreCalculationMethod === 'LATEST'
              ? (scores[scores.length - 1] ?? null)
              : scores.reduce((sum, score) => sum + score, 0) / scores.length
            : null;
      }

      const response = await fetch(`/api/v1/workspaces/${wsId}/users/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: report.user_id,
          group_id: report.group_id,
          title: payload.title,
          content: payload.content,
          feedback: payload.feedback,
          score: calculatedScore,
          scores: calculatedScores,
        }),
      });

      if (!response.ok) {
        if (response.status === 409) {
          throw new Error(t('ws-reports.duplicate_report_exists'));
        }
        const data = await response.json();
        throw new Error(data.message || t('ws-reports.failed_create_report'));
      }

      return await response.json();
    },
    onSuccess: async (data) => {
      toast.success(t('ws-reports.report_created'));
      const statusPromises = [
        queryClient.invalidateQueries({
          queryKey: ['ws', wsId, 'group-report-status-summary'],
        }),
      ];
      if (report.group_id) {
        statusPromises.push(
          queryClient.invalidateQueries({
            queryKey: [
              'ws',
              wsId,
              'group',
              report.group_id,
              'reports-dashboard',
            ],
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
      if (report.user_id && report.group_id) {
        statusPromises.push(
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
      await Promise.all(statusPromises);
      const isGroupContext = pathname.includes('/users/groups/');
      const sp = new URLSearchParams(searchParams.toString());
      if (report.user_id) sp.set('userId', report.user_id);
      sp.set('reportId', data.id);

      if (isGroupContext) {
        router.replace(`${pathname}?${sp.toString()}`);
      } else {
        router.replace(`/${wsId}/users/reports?${sp.toString()}`);
      }
    },
    onError: (err) => {
      const error = err as { code?: string; message?: string };
      const isDuplicate =
        error?.code === '23505' ||
        error?.message?.includes('duplicate key value') ||
        error?.message === t('ws-reports.duplicate_report_exists');

      toast.error(
        isDuplicate
          ? t('ws-reports.duplicate_report_exists')
          : err instanceof Error
            ? err.message
            : t('ws-reports.failed_create_report')
      );
    },
  });

  const invalidateReportQueries = createReportQueryInvalidator(
    queryClient,
    wsId,
    report
  );

  const updateMutation = useMutation({
    mutationFn: async (payload: {
      title: string;
      content: string;
      feedback: string;
      score?: number | null;
    }) => {
      if (!report.id) throw new Error('Missing report id');

      const response = await fetch(
        `/api/v1/workspaces/${wsId}/users/reports/${report.id}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: payload.title,
            content: payload.content,
            feedback: payload.feedback,
            score: payload.score,
            // Auto-approve when user with approval permission saves
            ...(canApproveReports &&
            report.report_approval_status !== 'APPROVED'
              ? buildApproveFields()
              : {}),
          }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || t('ws-reports.failed_save_report'));
      }
    },
    onSuccess: async () => {
      toast.success(t('ws-reports.report_saved'));
      await invalidateReportQueries();
    },
    onError: (err) => {
      toast.error(
        err instanceof Error ? err.message : t('ws-reports.failed_save_report')
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!report.id) throw new Error('Missing report id');

      const response = await fetch(
        `/api/v1/workspaces/${wsId}/users/reports/${report.id}`,
        {
          method: 'DELETE',
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || t('ws-reports.failed_delete_report'));
      }
    },
    onSuccess: async () => {
      toast.success(t('ws-reports.report_deleted'));
      const deletePromises = [
        queryClient.invalidateQueries({
          queryKey: ['ws', wsId, 'group-report-status-summary'],
        }),
      ];
      if (report.group_id) {
        deletePromises.push(
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
      if (report.user_id && report.group_id) {
        deletePromises.push(
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
      await Promise.all(deletePromises);
      const isGroupContext = pathname.includes('/users/groups/');
      const sp = new URLSearchParams(searchParams.toString());
      if (report.user_id) sp.set('userId', report.user_id);
      sp.delete('reportId');

      if (isGroupContext) {
        router.replace(`${pathname}?${sp.toString()}`);
      } else {
        router.replace(`/${wsId}/users/reports?${sp.toString()}`);
      }
    },
    onError: (err) => {
      toast.error(
        err instanceof Error
          ? err.message
          : t('ws-reports.failed_delete_report')
      );
    },
  });

  const updateScoresMutation = useMutation({
    mutationFn: async (options?: { force?: boolean }) => {
      if (!report.id || !report.user_id || !report.group_id) {
        throw new Error('Missing report, user, or group information');
      }

      // To fetch vitals, we need another API or use an existing one.
      // /api/v1/workspaces/${wsId}/users/reports/groups/${groupId}/dashboard already returns vitals!
      // But we need them for a specific user.
      const searchParams = new URLSearchParams({
        userId: report.user_id,
        reportId: report.id,
      });

      const dashboardRes = await fetch(
        `/api/v1/workspaces/${wsId}/users/reports/groups/${report.group_id}/dashboard?${searchParams.toString()}`,
        { cache: 'no-store' }
      );

      if (!dashboardRes.ok) throw new Error('Failed to fetch vitals');
      const dashboardData = await dashboardRes.json();
      const vitals = (dashboardData.userGroupMetrics || []) as Array<{
        id: string;
        is_weighted?: boolean;
        name: string;
        unit: string;
        factor: number;
        value: number | null;
      }>;

      const scores = vitals
        .filter(
          (vital) =>
            vital.is_weighted !== false &&
            vital.value !== null &&
            vital.value !== undefined
        )
        .map((vital) => {
          const baseValue = vital.value ?? 0;
          return factorEnabled ? baseValue * (vital.factor ?? 1) : baseValue;
        });

      if (scores.length === 0 && !options?.force) {
        return {
          scores,
          calculatedScore: null,
          vitals,
          needsConfirmation: true,
        };
      }

      const calculatedScore =
        scores.length > 0
          ? scoreCalculationMethod === 'LATEST'
            ? (scores[scores.length - 1] ?? null)
            : scores.reduce((sum, score) => sum + score, 0) / scores.length
          : null;

      const updateRes = await fetch(
        `/api/v1/workspaces/${wsId}/users/reports/${report.id}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scores: scores.length > 0 ? scores : null,
            score: calculatedScore,
            // Auto-approve when user with approval permission saves
            ...(canApproveReports &&
            report.report_approval_status !== 'APPROVED'
              ? buildApproveFields()
              : // If user cannot approve and report was REJECTED, reset to PENDING so they can resubmit
                !canApproveReports &&
                  report.report_approval_status === 'REJECTED'
                ? {
                    report_approval_status: 'PENDING',
                    rejected_at: null,
                    rejection_reason: null,
                    rejected_by: null,
                  }
                : {}),
          }),
        }
      );

      if (!updateRes.ok) throw new Error(t('ws-reports.failed_update_scores'));

      return { scores, calculatedScore, vitals, needsConfirmation: false };
    },
    onSuccess: async (data) => {
      if (data.needsConfirmation) return;

      toast.success(t('ws-reports.scores_updated'));
      const scoresPromises = [
        queryClient.invalidateQueries({
          queryKey: ['ws', wsId, 'group-report-status-summary'],
        }),
      ];
      if (report.group_id) {
        scoresPromises.push(
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
      if (report.id) {
        scoresPromises.push(
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
              'user-group-metrics',
            ],
          })
        );
      }
      await Promise.all(scoresPromises);
    },
    onError: (err) => {
      toast.error(
        err instanceof Error
          ? err.message
          : t('ws-reports.failed_update_scores')
      );
    },
  });

  const { approveMutation, rejectMutation } = useReportApproval({
    wsId,
    report,
    invalidateReportQueries,
  });

  return {
    createMutation,
    updateMutation,
    deleteMutation,
    updateScoresMutation,
    approveMutation,
    rejectMutation,
  };
}
