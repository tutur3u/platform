'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@tuturuuu/ui/sonner';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

export interface TaskShare {
  id: string;
  shared_with_user_id?: string;
  shared_with_email?: string;
  permission: 'view' | 'edit';
  users?: {
    id: string;
    display_name?: string;
    handle?: string;
    avatar_url?: string;
  };
}

export interface TaskShareLink {
  id: string;
  code: string;
  public_access: 'none' | 'view';
  requires_invite: boolean;
}

export function useTaskSharing(wsId: string, taskId: string, open: boolean) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [showComingSoon, setShowComingSoon] = useState(false);

  const sharesQueryKey = useMemo(
    () => ['task-shares', { wsId, taskId }] as const,
    [wsId, taskId]
  );
  const shareLinksQueryKey = useMemo(
    () => ['task-share-links', { wsId, taskId }] as const,
    [wsId, taskId]
  );

  const sharesQuery = useQuery({
    queryKey: sharesQueryKey,
    enabled: open,
    queryFn: async (): Promise<TaskShare[]> => {
      const res = await fetch(
        `/api/v1/workspaces/${wsId}/tasks/${taskId}/shares`
      );
      if (!res.ok) throw new Error('Failed to load shares');
      const data = await res.json();
      return data.shares || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const shareLinksQuery = useQuery({
    queryKey: shareLinksQueryKey,
    enabled: open,
    queryFn: async (): Promise<TaskShareLink> => {
      const res = await fetch(
        `/api/v1/workspaces/${wsId}/tasks/${taskId}/share-links`
      );
      if (!res.ok) throw new Error('Failed to load share links');
      const data = await res.json();
      return data.shareLink;
    },
  });

  const addShareMutation = useMutation({
    mutationFn: async (payload: { email: string }) => {
      const res = await fetch(
        `/api/v1/workspaces/${wsId}/tasks/${taskId}/shares`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: payload.email, permission: 'view' }),
        }
      );

      if (!res.ok) {
        const error = await res.json().catch(() => null);
        throw new Error(error?.error || 'Failed to create share');
      }
    },
    onSuccess: async () => {
      toast.success(t('common.task_sharing.share_created'));
      await queryClient.invalidateQueries({ queryKey: sharesQueryKey });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : t('common.task_sharing.errors.create_share')
      );
    },
  });

  const updatePermissionMutation = useMutation({
    mutationFn: async (payload: {
      shareId: string;
      permission: 'view' | 'edit';
    }) => {
      const res = await fetch(
        `/api/v1/workspaces/${wsId}/tasks/${taskId}/shares`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: payload.shareId,
            permission: payload.permission,
          }),
        }
      );

      if (!res.ok) throw new Error('Failed to update permission');
    },
    onSuccess: async () => {
      toast.success(t('common.task_sharing.permission_updated'));
      await queryClient.invalidateQueries({ queryKey: sharesQueryKey });
    },
    onError: () => {
      toast.error(t('common.task_sharing.errors.update_permission'));
    },
  });

  const removeShareMutation = useMutation({
    mutationFn: async (payload: { shareId: string }) => {
      const res = await fetch(
        `/api/v1/workspaces/${wsId}/tasks/${taskId}/shares?id=${payload.shareId}`,
        { method: 'DELETE' }
      );

      if (!res.ok) throw new Error('Failed to remove share');
    },
    onSuccess: async () => {
      toast.success(t('common.task_sharing.share_removed'));
      await queryClient.invalidateQueries({ queryKey: sharesQueryKey });
    },
    onError: () => {
      toast.error(t('common.task_sharing.errors.remove_share'));
    },
  });

  const updateLinkMutation = useMutation({
    mutationFn: async (payload: {
      publicAccess?: 'none' | 'view';
      requiresInvite?: boolean;
    }) => {
      const res = await fetch(
        `/api/v1/workspaces/${wsId}/tasks/${taskId}/share-links`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );

      if (!res.ok) {
        const error = await res.json().catch(() => null);
        throw new Error(error?.error || 'Failed to update share link');
      }
    },
    onSuccess: async () => {
      toast.success(t('common.task_sharing.link_updated'));
      await queryClient.invalidateQueries({ queryKey: shareLinksQueryKey });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : t('common.task_sharing.errors.update_link')
      );
    },
  });

  const handleAddShare = async (email: string) => {
    // Regex for email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      toast.error(t('common.task_sharing.errors.invalid_email'));
      return false;
    }

    if (!emailRegex.test(trimmedEmail)) {
      toast.error(t('common.task_sharing.errors.invalid_email'));
      return false;
    }

    await addShareMutation.mutateAsync({ email: trimmedEmail });
    return true;
  };

  const handleUpdatePermission = async (
    shareId: string,
    permission: 'view' | 'edit'
  ) => {
    await updatePermissionMutation.mutateAsync({ shareId, permission });
  };

  const handleRemoveShare = async (shareId: string) => {
    await removeShareMutation.mutateAsync({ shareId });
  };

  const handleCopyLink = async (code: string) => {
    const url = `${window.location.origin}/shared/task/${code}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t('common.task_sharing.link_copied'));
    } catch (error) {
      console.error('Failed to copy link:', error);
      toast.error(t('common.task_sharing.errors.copy_failed'));
    }
  };

  const handleToggleInviteOnly = async (nextRequiresInvite: boolean) => {
    await updateLinkMutation.mutateAsync({
      requiresInvite: nextRequiresInvite,
    });
  };

  const handleTogglePublicAccess = async (enabled: boolean) => {
    if (wsId !== ROOT_WORKSPACE_ID) {
      setShowComingSoon(true);
      return;
    }
    await updateLinkMutation.mutateAsync({
      publicAccess: enabled ? 'view' : 'none',
    });
  };

  return {
    shares: sharesQuery.data || [],
    shareLink: shareLinksQuery.data,
    loading: sharesQuery.isLoading || shareLinksQuery.isLoading,
    creating:
      addShareMutation.isPending ||
      updatePermissionMutation.isPending ||
      removeShareMutation.isPending ||
      updateLinkMutation.isPending,
    showComingSoon,
    setShowComingSoon,
    handleAddShare,
    handleUpdatePermission,
    handleRemoveShare,
    handleCopyLink,
    handleToggleInviteOnly,
    handleTogglePublicAccess,
  };
}
