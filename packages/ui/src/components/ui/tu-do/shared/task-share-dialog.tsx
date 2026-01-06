'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Loader2, Mail, User, X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Separator } from '@tuturuuu/ui/separator';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

interface TaskShare {
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

interface TaskShareLink {
  id: string;
  code: string;
  public_access: 'none' | 'view';
  requires_invite: boolean;
}

interface TaskShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskId: string;
  taskName: string;
  wsId: string;
}

export function TaskShareDialog({
  open,
  onOpenChange,
  taskId,
  taskName,
  wsId,
}: TaskShareDialogProps) {
  const t = useTranslations();
  const [email, setEmail] = useState('');
  const queryClient = useQueryClient();

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
      setEmail('');
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

  const loading = sharesQuery.isLoading || shareLinksQuery.isLoading;
  const creating =
    addShareMutation.isPending ||
    updatePermissionMutation.isPending ||
    removeShareMutation.isPending ||
    updateLinkMutation.isPending;

  const shares = sharesQuery.data || [];
  const shareLink = shareLinksQuery.data;

  const handleAddShare = async () => {
    if (!email.trim()) {
      toast.error(t('common.task_sharing.errors.invalid_email'));
      return;
    }

    await addShareMutation.mutateAsync({ email: email.trim() });
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

  const handleCopyLink = (code: string) => {
    const url = `${window.location.origin}/shared/task/${code}`;
    navigator.clipboard.writeText(url);
    toast.success(t('common.task_sharing.link_copied'));
  };

  const handleToggleInviteOnly = async (nextRequiresInvite: boolean) => {
    await updateLinkMutation.mutateAsync({
      requiresInvite: nextRequiresInvite,
    });
  };

  const handleTogglePublicAccess = async (enabled: boolean) => {
    await updateLinkMutation.mutateAsync({
      publicAccess: enabled ? 'view' : 'none',
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-125">
        <DialogHeader>
          <DialogTitle>
            {t('common.task_sharing.share_task')} &quot;
            {taskName}&quot;
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Add people section */}
          <div className="space-y-2">
            <Label>{t('common.task_sharing.add_people')}</Label>
            <div className="flex gap-2">
              <Input
                placeholder={t('common.task_sharing.email_or_name')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddShare();
                }}
                disabled={creating}
              />
              <Button
                onClick={handleAddShare}
                disabled={creating || !email.trim()}
                size="icon"
              >
                {creating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <User className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* People with access */}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : shares.length > 0 ? (
            <div className="space-y-2">
              <Label>{t('common.task_sharing.people_with_access')}</Label>
              <div className="space-y-2 rounded-lg border p-2">
                {shares.map((share) => (
                  <div
                    key={share.id}
                    className="flex items-center justify-between gap-2 rounded-md p-2 hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-2">
                      {share.shared_with_email ? (
                        <Mail className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <User className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="text-sm">
                        {share.users?.display_name ||
                          share.users?.handle ||
                          share.shared_with_email}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select
                        value={share.permission}
                        onValueChange={(value: 'view' | 'edit') =>
                          handleUpdatePermission(share.id, value)
                        }
                      >
                        <SelectTrigger className="h-8 w-25">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="view">
                            {t('common.task_sharing.viewer')}
                          </SelectItem>
                          <SelectItem value="edit">
                            {t('common.task_sharing.editor')}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleRemoveShare(share.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <Separator />

          {/* Copy link section */}
          <div className="space-y-3">
            <Label>{t('common.task_sharing.copy_link')}</Label>

            {shareLink ? (
              <div className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Copy className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground text-sm">
                      {shareLink.public_access === 'view'
                        ? t('common.task_sharing.anyone_with_link_can_view')
                        : t('common.task_sharing.only_invited_people')}
                    </span>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleCopyLink(shareLink.code)}
                    disabled={creating}
                  >
                    {t('common.task_sharing.copy_link')}
                  </Button>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={shareLink.public_access === 'view'}
                      onCheckedChange={(checked) =>
                        handleTogglePublicAccess(Boolean(checked))
                      }
                      disabled={creating || shareLink.requires_invite}
                    />
                    <span className="text-sm">
                      {t('common.task_sharing.public_access')}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={shareLink.requires_invite}
                      onCheckedChange={(checked) =>
                        handleToggleInviteOnly(Boolean(checked))
                      }
                      disabled={creating}
                    />
                    <span className="text-sm">
                      {t('common.task_sharing.invite_only')}
                    </span>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
