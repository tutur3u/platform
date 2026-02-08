'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
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
  report_approval_status?: 'PENDING' | 'APPROVED' | 'REJECTED' | null;
};

export function useReportMutations({
  wsId,
  report,
  isNew,
  healthcareVitals = [],
  factorEnabled = false,
  scoreCalculationMethod = 'LATEST',
  canApproveReports = false,
}: {
  wsId: string;
  report: UserReport;
  isNew: boolean;
  healthcareVitals?: Array<{
    id: string;
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
  const supabase = createClient();
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

      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (!authUser) throw new Error('User not authenticated');

      const { data: workspaceUser, error: workspaceUserError } = await supabase
        .from('workspace_user_linked_users')
        .select('virtual_user_id')
        .eq('platform_user_id', authUser.id)
        .eq('ws_id', wsId)
        .single();

      if (workspaceUserError) throw workspaceUserError;
      if (!workspaceUser) throw new Error('User not found in workspace');

      let calculatedScores = report.scores;
      let calculatedScore = report.score;

      if (isNew && healthcareVitals.length > 0) {
        const scores = healthcareVitals
          .filter((vital) => vital.value !== null && vital.value !== undefined)
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

      // Check for duplicate report with same user, group, and title
      const { data: existing } = await supabase
        .from('external_user_monthly_reports')
        .select('id')
        .eq('user_id', report.user_id)
        .eq('group_id', report.group_id)
        .eq('title', payload.title)
        .limit(1)
        .maybeSingle();

      if (existing) {
        throw new Error(t('ws-reports.duplicate_report_exists'));
      }

      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('external_user_monthly_reports')
        .insert({
          user_id: report.user_id,
          group_id: report.group_id,
          title: payload.title,
          content: payload.content,
          feedback: payload.feedback,
          score: calculatedScore,
          scores: calculatedScores,
          creator_id: workspaceUser.virtual_user_id ?? undefined,
          created_at: now,
          updated_at: now,
        })
        .select('id')
        .single();
      if (error) throw error;
      return data as { id: string };
    },
    onSuccess: async (data) => {
      toast.success(t('ws-reports.report_created'));
      if (report.user_id && report.group_id) {
        await queryClient.invalidateQueries({
          queryKey: [
            'ws',
            wsId,
            'group',
            report.group_id,
            'user',
            report.user_id,
            'reports',
          ],
        });
      }
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
    onError: (err: any) => {
      const isDuplicate =
        err?.code === '23505' ||
        err?.message?.includes('duplicate key value') ||
        err?.message === t('ws-reports.duplicate_report_exists');

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
      const { error } = await supabase
        .from('external_user_monthly_reports')
        .update({
          title: payload.title,
          content: payload.content,
          feedback: payload.feedback,
          score: payload.score,
          updated_at: new Date().toISOString(),
          // Auto-approve when user with approval permission saves
          ...(canApproveReports && report.report_approval_status !== 'APPROVED'
            ? buildApproveFields()
            : {}),
        })
        .eq('id', report.id);
      if (error) throw error;
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
      const { error } = await supabase
        .from('external_user_monthly_reports')
        .delete()
        .eq('id', report.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success(t('ws-reports.report_deleted'));
      if (report.user_id && report.group_id) {
        await queryClient.invalidateQueries({
          queryKey: [
            'ws',
            wsId,
            'group',
            report.group_id,
            'user',
            report.user_id,
            'reports',
          ],
        });
      }
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

      const { data: vitalsData, error: vitalsError } = await supabase
        .from('user_indicators')
        .select(`
          value,
          healthcare_vitals!inner(
            id,
            name,
            unit,
            factor,
            group_id,
            created_at
          )
        `)
        .eq('user_id', report.user_id)
        .eq('healthcare_vitals.group_id', report.group_id);

      if (vitalsError) throw vitalsError;

      // Sort by healthcare_vitals.created_at ASC to ensure
      // scores[scores.length - 1] corresponds to the latest column
      const vitals = (vitalsData ?? [])
        .sort(
          (a, b) =>
            new Date(a.healthcare_vitals.created_at ?? 0).getTime() -
            new Date(b.healthcare_vitals.created_at ?? 0).getTime()
        )
        .map((item) => ({
          id: item.healthcare_vitals.id,
          name: item.healthcare_vitals.name,
          unit: item.healthcare_vitals.unit,
          factor: item.healthcare_vitals.factor,
          value: item.value,
        }));

      const scores = vitals
        .filter((vital) => vital.value !== null && vital.value !== undefined)
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

      const { error: updateError } = await supabase
        .from('external_user_monthly_reports')
        .update({
          scores: scores.length > 0 ? scores : null,
          score: calculatedScore,
          updated_at: new Date().toISOString(),
        })
        .eq('id', report.id);

      if (updateError) throw updateError;

      return { scores, calculatedScore, vitals, needsConfirmation: false };
    },
    onSuccess: async (data) => {
      if (data.needsConfirmation) return;

      toast.success(t('ws-reports.scores_updated'));
      if (report.id) {
        await Promise.all([
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
              'healthcare-vitals',
            ],
          }),
        ]);
      }
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
