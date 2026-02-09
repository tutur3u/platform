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
import { useCallback, useMemo, useRef, useState } from 'react';
import type { ApprovalStatus } from '../utils';

interface UseApprovalsOptions {
  wsId: string;
  kind: 'reports' | 'posts';
  status?: 'all' | 'pending' | 'approved' | 'rejected';
  page?: number;
  limit?: number;
  groupId?: string;
  userId?: string;
  creatorId?: string;
}

interface PaginatedResult<T> {
  items: T[];
  totalCount: number;
  totalPages: number;
}

interface SessionStats {
  approved: number;
  rejected: number;
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
  approveAllItems: () => void;
  rejectItem: (params: { id: string; reason: string }) => void;
  isApproving: boolean;
  isApprovingAll: boolean;
  approveAllProgress: { current: number; total: number } | null;
  isRejecting: boolean;
  formatDate: (value?: string | null) => string;
  getStatusLabel: (status: ApprovalStatus) => string;
  // Detail dialog
  detailItem: ApprovalItem | null;
  setDetailItem: (item: ApprovalItem | null) => void;
  closeDetailDialog: () => void;
  pendingItemIds: string[];
  totalPendingCount: number;
  // Session stats
  sessionStats: SessionStats;
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
  groupId,
  userId,
  creatorId,
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
  const [approveAllProgress, setApproveAllProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [sessionStats, setSessionStats] = useState<SessionStats>({
    approved: 0,
    rejected: 0,
  });
  const mutatingItemIdRef = useRef<string | null>(null);

  const reportsQuery = useQuery({
    queryKey: [
      'ws',
      wsId,
      'approvals',
      'reports',
      status,
      page,
      limit,
      groupId,
      userId,
      creatorId,
    ],
    enabled: kind === 'reports',
    queryFn: async (): Promise<PaginatedResult<ReportApprovalItem>> => {
      // Build base query for count (without head: true to support relation filters)
      let countQuery = supabase
        .from('external_user_monthly_reports')
        .select('id, user:workspace_users!user_id!inner(ws_id)', {
          count: 'exact',
        })
        .eq('user.ws_id', wsId);

      if (groupId) {
        countQuery = countQuery.eq('group_id', groupId);
      }
      if (userId) {
        countQuery = countQuery.eq('user_id', userId);
      }
      if (creatorId) {
        countQuery = countQuery.eq('creator_id', creatorId);
      }

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
          'id, title, content, feedback, score, scores, created_at, updated_by, user_id, group_id, creator_id, report_approval_status, rejection_reason, approved_at, rejected_at, modifier:workspace_users!updated_by(display_name, full_name, email), creator:workspace_users!creator_id(full_name), user:workspace_users!user_id!inner(full_name, ws_id), ...workspace_user_groups(group_name:name)'
        )
        .eq('user.ws_id', wsId);

      if (groupId) {
        dataQuery = dataQuery.eq('group_id', groupId);
      }
      if (userId) {
        dataQuery = dataQuery.eq('user_id', userId);
      }
      if (creatorId) {
        dataQuery = dataQuery.eq('creator_id', creatorId);
      }

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
          updated_by: row.updated_by,
          user_id: row.user_id,
          group_id: row.group_id,
          creator_id: row.creator_id,
          report_approval_status: row.report_approval_status,
          rejection_reason: row.rejection_reason,
          approved_at: row.approved_at,
          rejected_at: row.rejected_at,
          group_name: row.group_name,
          user_name: userName,
          modifier_name:
            row.modifier?.display_name ||
            row.modifier?.full_name ||
            row.modifier?.email ||
            row.creator?.full_name ||
            null,
          creator_name: row.creator?.full_name,
        };
      });

      // Deduplicate items based on user_id, group_id, and title
      // We keep the first occurrence since the query is ordered by updated_at desc
      const uniqueItems = items.filter(
        (item, index, self) =>
          index ===
          self.findIndex(
            (t) =>
              t.user_id === item.user_id &&
              t.group_id === item.group_id &&
              t.title === item.title
          )
      );

      const totalCount = count ?? 0;
      const totalPages = Math.ceil(totalCount / limit);

      return { items: uniqueItems, totalCount, totalPages };
    },
  });

  const postsQuery = useQuery({
    queryKey: ['ws', wsId, 'approvals', 'posts', status, page, limit, groupId],
    enabled: kind === 'posts',
    queryFn: async (): Promise<PaginatedResult<PostApprovalItem>> => {
      // Build base query for count (without head: true to support relation filters)
      let countQuery = supabase
        .from('user_group_posts')
        .select('id, workspace_user_groups!inner(ws_id)', { count: 'exact' })
        .eq('workspace_user_groups.ws_id', wsId);

      if (groupId) {
        countQuery = countQuery.eq('group_id', groupId);
      }

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
          'id, title, content, notes, created_at, updated_by, post_approval_status, rejection_reason, approved_at, rejected_at, group_id, modifier:workspace_users!updated_by(display_name, full_name, email), ...workspace_user_groups(group_name:name, ws_id)'
        )
        .eq('workspace_user_groups.ws_id', wsId);

      if (groupId) {
        dataQuery = dataQuery.eq('group_id', groupId);
      }

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
        .order('approved_at', { ascending: false })
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;
      const rows = data as PostApprovalQueryResult[] | null;
      const items = (rows ?? []).map((row) => ({
        ...row,
        group_name: row.group_name,
        modifier_name:
          row.modifier?.display_name ||
          row.modifier?.full_name ||
          row.modifier?.email ||
          null,
      }));

      const totalCount = count ?? 0;
      const totalPages = Math.ceil(totalCount / limit);

      return { items, totalCount, totalPages };
    },
  });

  // Compute the next item to show after an approve/reject action
  const advanceToNextItem = useCallback(
    (actedItemId: string) => {
      const currentItems =
        kind === 'reports'
          ? (reportsQuery.data?.items ?? [])
          : (postsQuery.data?.items ?? []);
      const idx = currentItems.findIndex((i) => i.id === actedItemId);
      if (idx === -1) {
        setDetailItem(null);
        return;
      }
      // Try next item, then previous, then close
      const nextItem = currentItems[idx + 1] ?? currentItems[idx - 1];
      if (nextItem) {
        setDetailItem({ ...nextItem, kind } as ApprovalItem);
      } else {
        setDetailItem(null);
      }
    },
    [kind, reportsQuery.data?.items, postsQuery.data?.items]
  );

  const approveMutation = useMutation({
    mutationFn: async (itemId: string) => {
      mutatingItemIdRef.current = itemId;
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
            // approved_by is set by database trigger to ensure correct workspace_user_id
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
            // approved_by is set by database trigger to ensure correct workspace_user_id
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
      setSessionStats((prev) => ({ ...prev, approved: prev.approved + 1 }));
      if (mutatingItemIdRef.current) {
        advanceToNextItem(mutatingItemIdRef.current);
        mutatingItemIdRef.current = null;
      } else {
        setDetailItem(null);
      }
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
      mutatingItemIdRef.current = null;
      toast.error(error instanceof Error ? error.message : tCommon('error'));
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      mutatingItemIdRef.current = id;
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
            // rejected_by is set by database trigger to ensure correct workspace_user_id
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
            // rejected_by is set by database trigger to ensure correct workspace_user_id
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
      setSessionStats((prev) => ({ ...prev, rejected: prev.rejected + 1 }));
      if (mutatingItemIdRef.current) {
        advanceToNextItem(mutatingItemIdRef.current);
        mutatingItemIdRef.current = null;
      } else {
        setDetailItem(null);
      }
      setRejectReason('');
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
      mutatingItemIdRef.current = null;
      toast.error(error instanceof Error ? error.message : tCommon('error'));
    },
  });

  const approveAllMutation = useMutation({
    mutationFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error(tCommon('error'));

      // Fetch ALL pending items (not just current page)
      let allPendingIds: string[] = [];

      if (kind === 'reports') {
        let q = supabase
          .from('external_user_monthly_reports')
          .select('id, user:workspace_users!user_id!inner(ws_id)')
          .eq('user.ws_id', wsId)
          .eq('report_approval_status', 'PENDING');
        if (groupId) q = q.eq('group_id', groupId);
        if (userId) q = q.eq('user_id', userId);
        if (creatorId) q = q.eq('creator_id', creatorId);
        const { data, error } = await q;
        if (error) throw error;
        allPendingIds = (data ?? []).map((item) => item.id);
      } else {
        let q = supabase
          .from('user_group_posts')
          .select('id, workspace_user_groups!inner(ws_id)')
          .eq('workspace_user_groups.ws_id', wsId)
          .eq('post_approval_status', 'PENDING');
        if (groupId) q = q.eq('group_id', groupId);
        const { data, error } = await q;
        if (error) throw error;
        allPendingIds = (data ?? []).map((item) => item.id);
      }

      if (allPendingIds.length === 0) return;

      const BATCH_SIZE = 100;
      const totalItems = allPendingIds.length;
      setApproveAllProgress({ current: 0, total: totalItems });

      // Process in batches of 100
      for (let i = 0; i < allPendingIds.length; i += BATCH_SIZE) {
        const batch = allPendingIds.slice(i, i + BATCH_SIZE);
        const now = new Date().toISOString();

        if (kind === 'reports') {
          const { error } = await supabase
            .from('external_user_monthly_reports')
            .update({
              report_approval_status: 'APPROVED' as ApprovalStatus,
              approved_at: now,
              rejected_by: null,
              rejected_at: null,
              rejection_reason: null,
            })
            .in('id', batch);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('user_group_posts')
            .update({
              post_approval_status: 'APPROVED' as ApprovalStatus,
              approved_at: now,
              rejected_by: null,
              rejected_at: null,
              rejection_reason: null,
            })
            .in('id', batch);
          if (error) throw error;
        }

        setApproveAllProgress({
          current: Math.min(i + BATCH_SIZE, totalItems),
          total: totalItems,
        });
      }
    },
    onSuccess: async () => {
      toast.success(t('actions.allApproved'));
      setDetailItem(null);
      setApproveAllProgress(null);
      await queryClient.invalidateQueries({
        queryKey: ['ws', wsId, 'approvals', kind],
      });

      if (kind === 'posts') {
        await queryClient.invalidateQueries({
          queryKey: ['group-posts', wsId],
        });
      }
    },
    onError: (error) => {
      setApproveAllProgress(null);
      toast.error(error instanceof Error ? error.message : tCommon('error'));
    },
  });

  const { items, totalCount, totalPages, isError, error, pendingItemIds } =
    useMemo(() => {
      if (kind === 'reports') {
        const mappedItems = (reportsQuery.data?.items ?? []).map((item) => ({
          ...item,
          kind: 'reports' as const,
        }));
        return {
          items: mappedItems,
          totalCount: reportsQuery.data?.totalCount ?? 0,
          totalPages: reportsQuery.data?.totalPages ?? 0,
          isError: reportsQuery.isError,
          error: reportsQuery.error as Error | null,
          pendingItemIds: mappedItems
            .filter((item) => item.report_approval_status === 'PENDING')
            .map((item) => item.id),
        };
      }
      const mappedItems = (postsQuery.data?.items ?? []).map((item) => ({
        ...item,
        kind: 'posts' as const,
      }));
      return {
        items: mappedItems,
        totalCount: postsQuery.data?.totalCount ?? 0,
        totalPages: postsQuery.data?.totalPages ?? 0,
        isError: postsQuery.isError,
        error: postsQuery.error as Error | null,
        pendingItemIds: mappedItems
          .filter((item) => item.post_approval_status === 'PENDING')
          .map((item) => item.id),
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
    pendingItemIds,
    totalPendingCount: totalCount,
    closeRejectDialog,
    approveItem: approveMutation.mutate,
    approveAllItems: () => approveAllMutation.mutate(),
    rejectItem: rejectMutation.mutate,
    isApproving: approveMutation.isPending,
    isApprovingAll: approveAllMutation.isPending,
    approveAllProgress,
    isRejecting: rejectMutation.isPending,
    formatDate,
    getStatusLabel,
    detailItem,
    setDetailItem,
    closeDetailDialog,
    sessionStats,
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
