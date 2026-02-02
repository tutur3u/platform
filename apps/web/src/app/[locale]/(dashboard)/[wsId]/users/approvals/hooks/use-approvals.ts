'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import type {
  PostApprovalItem,
  PostApprovalQueryResult,
  PostLogEntry,
  ReportApprovalItem,
  ReportApprovalQueryResult,
  ReportLogEntry,
} from '@tuturuuu/types/db';
import { toast } from '@tuturuuu/ui/sonner';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import type { ApprovalStatus } from '../utils';

interface UseApprovalsOptions {
  wsId: string;
  kind: 'reports' | 'posts';
  status?: 'all' | 'pending' | 'approved' | 'rejected';
  page?: number;
  limit?: number;
}

interface PaginatedResult<T> {
  items: T[];
  totalCount: number;
  totalPages: number;
}

interface UseApprovalsResult {
  items: ApprovalItem[];
  totalCount: number;
  totalPages: number;
  loading: boolean;
  isError: boolean;
  error: Error | null;
  rejectTarget: { id: string; title?: string | null } | null;
  rejectReason: string;
  setRejectTarget: (
    target: { id: string; title?: string | null } | null
  ) => void;
  setRejectReason: (reason: string) => void;
  closeRejectDialog: () => void;
  approveItem: (itemId: string) => void;
  rejectItem: (params: { id: string; reason: string }) => void;
  isApproving: boolean;
  isRejecting: boolean;
  formatDate: (value?: string | null) => string;
  getStatusLabel: (status: ApprovalStatus) => string;
  // Detail dialog
  detailItem: ApprovalItem | null;
  setDetailItem: (item: ApprovalItem | null) => void;
  closeDetailDialog: () => void;
}

export type ApprovalItem =
  | ({ kind: 'reports' } & ReportApprovalItem)
  | ({ kind: 'posts' } & PostApprovalItem);

export function useApprovals({
  wsId,
  kind,
  status = 'all',
  page = 1,
  limit = 10,
}: UseApprovalsOptions): UseApprovalsResult {
  const t = useTranslations('approvals');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const supabase = createClient();
  const queryClient = useQueryClient();

  const [rejectTarget, setRejectTarget] = useState<{
    id: string;
    title?: string | null;
  } | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [detailItem, setDetailItem] = useState<ApprovalItem | null>(null);

  const reportsQuery = useQuery({
    queryKey: ['ws', wsId, 'approvals', 'reports', status, page, limit],
    enabled: kind === 'reports',
    queryFn: async (): Promise<PaginatedResult<ReportApprovalItem>> => {
      // Build base query for count (without head: true to support relation filters)
      let countQuery = supabase
        .from('external_user_monthly_reports')
        .select('id, user:workspace_users!user_id!inner(ws_id)', {
          count: 'exact',
        })
        .eq('user.ws_id', wsId);

      // Apply status filter
      if (status !== 'all') {
        countQuery = countQuery.eq(
          'report_approval_status',
          status.toUpperCase() as ApprovalStatus
        );
      }

      const { count, error: countError } = await countQuery;
      if (countError) throw countError;

      // Build data query
      let dataQuery = supabase
        .from('external_user_monthly_reports')
        .select(
          'id, title, content, feedback, score, scores, created_at, report_approval_status, rejection_reason, approved_at, rejected_at, user:workspace_users!user_id!inner(full_name, ws_id), ...workspace_user_groups(group_name:name)'
        )
        .eq('user.ws_id', wsId);

      // Apply status filter
      if (status !== 'all') {
        dataQuery = dataQuery.eq(
          'report_approval_status',
          status.toUpperCase() as ApprovalStatus
        );
      }

      // Apply pagination
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      const { data, error } = await dataQuery
        .order('updated_at', { ascending: false })
        .range(from, to);

      if (error) throw error;
      const rows = data as ReportApprovalQueryResult[] | null;
      const items = (rows ?? []).map((row) => {
        const user = row.user;
        const userName = Array.isArray(user)
          ? user?.[0]?.full_name
          : user?.full_name;
        return {
          id: row.id,
          title: row.title,
          content: row.content,
          feedback: row.feedback,
          score: row.score,
          scores: row.scores,
          created_at: row.created_at,
          report_approval_status: row.report_approval_status,
          rejection_reason: row.rejection_reason,
          approved_at: row.approved_at,
          rejected_at: row.rejected_at,
          group_name: row.group_name,
          user_name: userName,
        };
      });

      const totalCount = count ?? 0;
      const totalPages = Math.ceil(totalCount / limit);

      return { items, totalCount, totalPages };
    },
  });

  const postsQuery = useQuery({
    queryKey: ['ws', wsId, 'approvals', 'posts', status, page, limit],
    enabled: kind === 'posts',
    queryFn: async (): Promise<PaginatedResult<PostApprovalItem>> => {
      // Build base query for count (without head: true to support relation filters)
      let countQuery = supabase
        .from('user_group_posts')
        .select('id, workspace_user_groups!inner(ws_id)', { count: 'exact' })
        .eq('workspace_user_groups.ws_id', wsId);

      // Apply status filter
      if (status !== 'all') {
        countQuery = countQuery.eq(
          'post_approval_status',
          status.toUpperCase() as ApprovalStatus
        );
      }

      const { count, error: countError } = await countQuery;
      if (countError) throw countError;

      // Build data query
      let dataQuery = supabase
        .from('user_group_posts')
        .select(
          'id, title, content, notes, created_at, post_approval_status, rejection_reason, approved_at, rejected_at, ...workspace_user_groups(group_name:name, ws_id)'
        )
        .eq('workspace_user_groups.ws_id', wsId);

      // Apply status filter
      if (status !== 'all') {
        dataQuery = dataQuery.eq(
          'post_approval_status',
          status.toUpperCase() as ApprovalStatus
        );
      }

      // Apply pagination
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      const { data, error } = await dataQuery
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;
      const rows = data as PostApprovalQueryResult[] | null;
      const items = (rows ?? []).map((row) => ({
        id: row.id,
        title: row.title,
        content: row.content,
        notes: row.notes,
        created_at: row.created_at,
        post_approval_status: row.post_approval_status,
        rejection_reason: row.rejection_reason,
        approved_at: row.approved_at,
        rejected_at: row.rejected_at,
        group_name: row.group_name,
      }));

      const totalCount = count ?? 0;
      const totalPages = Math.ceil(totalCount / limit);

      return { items, totalCount, totalPages };
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error(tCommon('error'));
      const now = new Date().toISOString();

      if (kind === 'reports') {
        const { error } = await supabase
          .from('external_user_monthly_reports')
          .update({
            report_approval_status: 'APPROVED' as ApprovalStatus,
            approved_by: user.id,
            approved_at: now,
            rejected_by: null,
            rejected_at: null,
            rejection_reason: null,
          })
          .eq('id', itemId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('user_group_posts')
          .update({
            post_approval_status: 'APPROVED' as ApprovalStatus,
            approved_by: user.id,
            approved_at: now,
            rejected_by: null,
            rejected_at: null,
            rejection_reason: null,
          })
          .eq('id', itemId);
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      toast.success(t('actions.approved'));
      await queryClient.invalidateQueries({
        queryKey: ['ws', wsId, 'approvals', kind],
      });

      // Also invalidate group-posts queries when a post is approved/rejected
      // This updates the post list in the groups view
      if (kind === 'posts') {
        await queryClient.invalidateQueries({
          queryKey: ['group-posts', wsId],
        });
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : tCommon('error'));
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error(tCommon('error'));
      const now = new Date().toISOString();

      if (kind === 'reports') {
        const { error } = await supabase
          .from('external_user_monthly_reports')
          .update({
            report_approval_status: 'REJECTED' as ApprovalStatus,
            rejected_by: user.id,
            rejected_at: now,
            rejection_reason: reason,
            approved_by: null,
            approved_at: null,
          })
          .eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('user_group_posts')
          .update({
            post_approval_status: 'REJECTED' as ApprovalStatus,
            rejected_by: user.id,
            rejected_at: now,
            rejection_reason: reason,
            approved_by: null,
            approved_at: null,
          })
          .eq('id', id);
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      toast.success(t('actions.rejected'));
      await queryClient.invalidateQueries({
        queryKey: ['ws', wsId, 'approvals', kind],
      });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : tCommon('error'));
    },
  });

  const { items, totalCount, totalPages, isError, error } = useMemo(() => {
    if (kind === 'reports') {
      return {
        items: (reportsQuery.data?.items ?? []).map((item) => ({
          ...item,
          kind: 'reports' as const,
        })),
        totalCount: reportsQuery.data?.totalCount ?? 0,
        totalPages: reportsQuery.data?.totalPages ?? 0,
        isError: reportsQuery.isError,
        error: reportsQuery.error as Error | null,
      };
    }
    return {
      items: (postsQuery.data?.items ?? []).map((item) => ({
        ...item,
        kind: 'posts' as const,
      })),
      totalCount: postsQuery.data?.totalCount ?? 0,
      totalPages: postsQuery.data?.totalPages ?? 0,
      isError: postsQuery.isError,
      error: postsQuery.error as Error | null,
    };
  }, [
    kind,
    postsQuery.data,
    postsQuery.isError,
    postsQuery.error,
    reportsQuery.data,
    reportsQuery.isError,
    reportsQuery.error,
  ]);

  const loading =
    kind === 'reports' ? reportsQuery.isLoading : postsQuery.isLoading;

  const formatDate = (value?: string | null) => {
    if (!value) return '';
    return new Date(value).toLocaleString(locale);
  };

  const getStatusLabel = (status: ApprovalStatus) =>
    t(`status.${status.toLowerCase() as 'pending' | 'approved' | 'rejected'}`);

  const closeRejectDialog = () => {
    setRejectTarget(null);
    setRejectReason('');
  };

  const closeDetailDialog = () => {
    setDetailItem(null);
  };

  return {
    items,
    totalCount,
    totalPages,
    loading,
    isError,
    error,
    rejectTarget,
    rejectReason,
    setRejectTarget,
    setRejectReason,
    closeRejectDialog,
    approveItem: approveMutation.mutate,
    rejectItem: rejectMutation.mutate,
    isApproving: approveMutation.isPending,
    isRejecting: rejectMutation.isPending,
    formatDate,
    getStatusLabel,
    detailItem,
    setDetailItem,
    closeDetailDialog,
  };
}

// Separate hook for fetching the latest approved log
export function useLatestApprovedLog(reportId: string | null) {
  const supabase = createClient();

  return useQuery({
    queryKey: ['latest-approved-log', reportId],
    enabled: !!reportId,
    queryFn: async (): Promise<ReportLogEntry | null> => {
      if (!reportId) return null;

      const { data, error } = await supabase
        .from('external_user_monthly_report_logs')
        .select(
          'id, report_id, title, content, feedback, score, scores, created_at, report_approval_status, approved_at'
        )
        .eq('report_id', reportId)
        .eq('report_approval_status', 'APPROVED')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data as ReportLogEntry | null;
    },
  });
}

// Hook for fetching the latest approved post log
export function useLatestApprovedPostLog(postId: string | null) {
  const supabase = createClient();

  return useQuery({
    queryKey: ['latest-approved-post-log', postId],
    enabled: !!postId,
    queryFn: async (): Promise<PostLogEntry | null> => {
      if (!postId) return null;

      const { data, error } = await supabase
        .from('user_group_post_logs')
        .select('*')
        .eq('post_id', postId)
        .eq('post_approval_status', 'APPROVED')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data as PostLogEntry | null;
    },
  });
}
