'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronDown,
  Info,
  Loader2,
  Share2,
  Trash2,
  Users,
} from '@tuturuuu/icons';
import {
  createWorkspaceTaskBoardShare,
  deleteWorkspaceTaskBoardShare,
  listWorkspaceTaskBoardShares,
  listWorkspaceTaskBoardViewableMembers,
  updateWorkspaceTaskBoardShare,
  type WorkspaceTaskBoardShare,
  type WorkspaceTaskBoardSharePermission,
  type WorkspaceTaskBoardViewableMember,
} from '@tuturuuu/internal-api/tasks';
import type { WorkspaceTaskBoard } from '@tuturuuu/types';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tuturuuu/ui/collapsible';
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
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

function viewableMemberDisplayName(member: WorkspaceTaskBoardViewableMember) {
  return (
    member.display_name ||
    (member.handle ? `@${member.handle}` : null) ||
    member.email ||
    member.user_id
  );
}

function NoteTooltip({ content, label }: { content: string; label: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="text-muted-foreground transition-colors hover:text-foreground"
            role="img"
            aria-label={label}
          >
            <Info className="h-3.5 w-3.5" />
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{content}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
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
  const [membersOpen, setMembersOpen] = useState(false);

  const queryKey = ['task-board-shares', wsId, board.id] as const;
  const sharesQuery = useQuery({
    queryKey,
    queryFn: () => listWorkspaceTaskBoardShares(wsId, board.id),
    enabled: open,
  });
  const viewableMembersQuery = useQuery({
    queryKey: ['task-board-viewable-members', wsId, board.id] as const,
    queryFn: () => listWorkspaceTaskBoardViewableMembers(wsId, board.id),
    enabled: open && membersOpen,
    staleTime: 60_000,
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

          <Collapsible
            open={membersOpen}
            onOpenChange={setMembersOpen}
            className="rounded-md border"
          >
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 p-3 text-left transition-colors hover:bg-muted/40"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium text-sm">
                    {t('ws-task-boards.share.workspace_members.title')}
                  </span>
                  <NoteTooltip
                    label={t('ws-task-boards.share.note')}
                    content={t(
                      'ws-task-boards.share.workspace_members.tooltip'
                    )}
                  />
                  {viewableMembersQuery.data?.members.length ? (
                    <Badge variant="secondary">
                      {viewableMembersQuery.data.members.length}
                    </Badge>
                  ) : null}
                </span>
                <ChevronDown
                  className={cn(
                    'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                    membersOpen && 'rotate-180'
                  )}
                />
              </button>
            </CollapsibleTrigger>
            <div className="px-3 pb-3 text-muted-foreground text-sm">
              {t('ws-task-boards.share.workspace_members.description')}
            </div>
            <CollapsibleContent className="border-t">
              {viewableMembersQuery.isLoading ? (
                <div className="flex items-center gap-2 p-3 text-muted-foreground text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('common.loading')}
                </div>
              ) : (viewableMembersQuery.data?.members ?? []).length === 0 ? (
                <div className="p-3 text-muted-foreground text-sm">
                  {t('ws-task-boards.share.workspace_members.empty')}
                </div>
              ) : (
                <div className="divide-y">
                  {viewableMembersQuery.data?.members.map((member) => (
                    <div
                      key={member.user_id}
                      className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={member.avatar_url ?? undefined} />
                          <AvatarFallback>
                            {getInitials(viewableMemberDisplayName(member))}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="truncate font-medium text-sm">
                            {viewableMemberDisplayName(member)}
                          </div>
                          <div className="truncate text-muted-foreground text-xs">
                            {member.email || member.user_id}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {member.is_creator && (
                          <Badge variant="secondary">
                            {t(
                              'ws-task-boards.share.workspace_members.creator'
                            )}
                          </Badge>
                        )}
                        {member.roles.slice(0, 2).map((role) => (
                          <Badge key={role.id} variant="outline">
                            {role.name}
                          </Badge>
                        ))}
                        <Badge variant="outline">
                          {t('ws-task-boards.share.workspace_members.badge')}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>

          <div className="space-y-2">
            <div className="flex items-center gap-2 font-medium text-sm">
              {t('ws-task-boards.share.guests.title')}
              <NoteTooltip
                label={t('ws-task-boards.share.note')}
                content={t('ws-task-boards.share.guests.tooltip')}
              />
            </div>
            <p className="text-muted-foreground text-sm">
              {t('ws-task-boards.share.guests.description')}
            </p>
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
