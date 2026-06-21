'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Share2, Trash2 } from '@tuturuuu/icons';
import {
  createWorkspaceTaskBoardShare,
  deleteWorkspaceTaskBoardShare,
  listWorkspaceTaskBoardShares,
  updateWorkspaceTaskBoardShare,
  type WorkspaceTaskBoardShare,
  type WorkspaceTaskBoardSharePermission,
} from '@tuturuuu/internal-api/tasks';
import type { WorkspaceTaskBoard } from '@tuturuuu/types';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { getInitials } from '@tuturuuu/utils/name-helper';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { BoardPublicLinkSection } from './board-public-link-section';

interface BoardShareDialogProps {
  board: Pick<WorkspaceTaskBoard, 'id' | 'name'>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  wsId: string;
}

function shareDisplayName(share: WorkspaceTaskBoardShare) {
  return (
    share.user?.display_name ||
    (share.user?.handle ? `@${share.user.handle}` : null) ||
    share.email ||
    share.user_id ||
    'Guest'
  );
}

export function BoardShareDialog({
  board,
  onOpenChange,
  open,
  wsId,
}: BoardShareDialogProps) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [permission, setPermission] =
    useState<WorkspaceTaskBoardSharePermission>('view');

  const queryKey = ['task-board-shares', wsId, board.id] as const;
  const sharesQuery = useQuery({
    queryKey,
    queryFn: () => listWorkspaceTaskBoardShares(wsId, board.id),
    enabled: open,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createWorkspaceTaskBoardShare(wsId, board.id, {
        email,
        permission,
      }),
    onSuccess: () => {
      setEmail('');
      setPermission('view');
      void queryClient.invalidateQueries({ queryKey });
      toast.success(t('ws-task-boards.share.saved'));
    },
    onError: () => {
      toast.error(t('common.error'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      nextPermission,
      shareId,
    }: {
      nextPermission: WorkspaceTaskBoardSharePermission;
      shareId: string;
    }) =>
      updateWorkspaceTaskBoardShare(wsId, board.id, {
        shareId,
        permission: nextPermission,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: () => {
      toast.error(t('common.error'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (shareId: string) =>
      deleteWorkspaceTaskBoardShare(wsId, board.id, shareId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
      toast.success(t('ws-task-boards.share.removed'));
    },
    onError: () => {
      toast.error(t('common.error'));
    },
  });

  const shares = sharesQuery.data?.shares ?? [];
  const canSubmit =
    email.trim().length > 0 &&
    !createMutation.isPending &&
    !sharesQuery.isLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5" />
            {t('ws-task-boards.share.title', {
              name: board.name || t('common.untitled'),
            })}
          </DialogTitle>
          <DialogDescription>
            {t('ws-task-boards.share.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <BoardPublicLinkSection boardId={board.id} open={open} wsId={wsId} />

          <div className="rounded-md border bg-muted/30 p-3 text-muted-foreground text-sm">
            {t('ws-task-boards.share.guest_scope')}
          </div>

          <div className="grid gap-2 sm:grid-cols-[1fr_8rem_auto]">
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={t('ws-task-boards.share.email_placeholder')}
            />
            <Select
              value={permission}
              onValueChange={(value) =>
                setPermission(value as WorkspaceTaskBoardSharePermission)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="view">
                  {t('ws-task-boards.share.permission.view')}
                </SelectItem>
                <SelectItem value="edit">
                  {t('ws-task-boards.share.permission.edit')}
                </SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="button"
              onClick={() => createMutation.mutate()}
              disabled={!canSubmit}
            >
              {createMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t('common.share')
              )}
            </Button>
          </div>

          <div className="space-y-2">
            <div className="font-medium text-sm">
              {t('ws-task-boards.share.shared_with')}
            </div>
            {sharesQuery.isLoading ? (
              <div className="rounded-md border border-dashed p-4 text-muted-foreground text-sm">
                {t('common.loading')}
              </div>
            ) : shares.length === 0 ? (
              <div className="rounded-md border border-dashed p-4 text-muted-foreground text-sm">
                {t('ws-task-boards.share.empty')}
              </div>
            ) : (
              <div className="divide-y rounded-md border">
                {shares.map((share) => (
                  <div
                    key={share.id}
                    className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage
                          src={share.user?.avatar_url ?? undefined}
                        />
                        <AvatarFallback>
                          {getInitials(shareDisplayName(share))}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="truncate font-medium text-sm">
                          {shareDisplayName(share)}
                        </div>
                        <div className="truncate text-muted-foreground text-xs">
                          {share.email || share.user_id}
                        </div>
                      </div>
                    </div>

                    <Badge variant="outline" className="w-fit">
                      {t('common.guest_access')}
                    </Badge>

                    <Select
                      value={share.permission}
                      onValueChange={(value) =>
                        updateMutation.mutate({
                          shareId: share.id,
                          nextPermission:
                            value as WorkspaceTaskBoardSharePermission,
                        })
                      }
                    >
                      <SelectTrigger className="w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="view">
                          {t('ws-task-boards.share.permission.view')}
                        </SelectItem>
                        <SelectItem value="edit">
                          {t('ws-task-boards.share.permission.edit')}
                        </SelectItem>
                      </SelectContent>
                    </Select>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteMutation.mutate(share.id)}
                      disabled={deleteMutation.isPending}
                      aria-label={t('common.remove')}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
