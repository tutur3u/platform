'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  PostApprovalItem,
  PostLogEntry,
  ReportApprovalItem,
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
      const searchParams = new URLSearchParams({
        kind: 'reports',
        status,
        page: page.toString(),
        limit: limit.toString(),
      });
      if (groupId) searchParams.set('groupId', groupId);
      if (userId) searchParams.set('userId', userId);
      if (creatorId) searchParams.set('creatorId', creatorId);

      const response = await fetch(
        `/api/v1/workspaces/${wsId}/users/approvals?${searchParams.toString()}`,
        { cache: 'no-store' }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch report approvals');
      }

      const data = await response.json();
      return data;
    },
  });

  const postsQuery = useQuery({
    queryKey: ['ws', wsId, 'approvals', 'posts', status, page, limit, groupId],
    enabled: kind === 'posts',
    queryFn: async (): Promise<PaginatedResult<PostApprovalItem>> => {
      const searchParams = new URLSearchParams({
        kind: 'posts',
        status,
        page: page.toString(),
        limit: limit.toString(),
      });
      if (groupId) searchParams.set('groupId', groupId);

      const response = await fetch(
        `/api/v1/workspaces/${wsId}/users/approvals?${searchParams.toString()}`,
        { cache: 'no-store' }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch post approvals');
      }

      const data = await response.json();
      return data;
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

      const response = await fetch(
        `/api/v1/workspaces/${wsId}/users/approvals`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'approve',
            kind,
            itemId,
          }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || tCommon('error'));
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

      const response = await fetch(
        `/api/v1/workspaces/${wsId}/users/approvals`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'reject',
            kind,
            itemId: id,
            reason,
          }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || tCommon('error'));
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
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/users/approvals`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'approveAll',
            kind,
            filters: {
              groupId,
              userId,
              creatorId,
            },
          }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || tCommon('error'));
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
export function useLatestApprovedLog(wsId: string, reportId: string | null) {
  return useQuery({
    queryKey: ['latest-approved-log', reportId],
    enabled: !!reportId,
    queryFn: async (): Promise<ReportLogEntry | null> => {
      if (!reportId) return null;

      const response = await fetch(
        `/api/v1/workspaces/${wsId}/users/approvals/logs?kind=reports&reportId=${reportId}`,
        { cache: 'no-store' }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch latest approved log');
      }

      return await response.json();
    },
  });
}

// Hook for fetching the latest approved post log
export function useLatestApprovedPostLog(wsId: string, postId: string | null) {
  return useQuery({
    queryKey: ['latest-approved-post-log', postId],
    enabled: !!postId,
    queryFn: async (): Promise<PostLogEntry | null> => {
      if (!postId) return null;

      const response = await fetch(
        `/api/v1/workspaces/${wsId}/users/approvals/logs?kind=posts&postId=${postId}`,
        { cache: 'no-store' }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch latest approved post log');
      }

      return await response.json();
    },
  });
}
