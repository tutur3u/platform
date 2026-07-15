'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Trash2, Users } from '@tuturuuu/icons';
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
import { Combobox } from '@tuturuuu/ui/custom/combobox';
import { Input } from '@tuturuuu/ui/input';
import { getInitials } from '@tuturuuu/utils/name-helper';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { BoardPublicLinkSection } from './board-public-link-section';
import { ShareSection } from './share-section';

interface BoardShareSettingsPanelProps {
  board: Pick<WorkspaceTaskBoard, 'id' | 'name'>;
  enabled?: boolean;
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

export function BoardShareSettingsPanel({
  board,
  enabled = true,
  wsId,
}: BoardShareSettingsPanelProps) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [permission, setPermission] =
    useState<WorkspaceTaskBoardSharePermission>('view');
  const [membersOpen, setMembersOpen] = useState(false);
  const [guestsOpen, setGuestsOpen] = useState(false);

  const queryKey = ['task-board-shares', wsId, board.id] as const;
  const sharesQuery = useQuery({
    queryKey,
    queryFn: () => listWorkspaceTaskBoardShares(wsId, board.id),
    enabled,
  });
  const viewableMembersQuery = useQuery({
    queryKey: ['task-board-viewable-members', wsId, board.id] as const,
    queryFn: () => listWorkspaceTaskBoardViewableMembers(wsId, board.id),
    enabled: enabled && membersOpen,
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
  const members = Array.isArray(viewableMembersQuery.data?.members)
    ? viewableMembersQuery.data.members
    : undefined;
  const membersCount = members?.length;
  const membersStatusBadge = viewableMembersQuery.isLoading ? (
    <Badge variant="secondary" className="gap-1 px-2 py-0.5 text-[10px]">
      <Loader2 className="h-3 w-3 animate-spin" />
      {t('common.loading')}
    </Badge>
  ) : typeof membersCount === 'number' ? (
    <Badge variant="secondary" className="px-2 py-0.5 text-[10px]">
      {membersCount}
    </Badge>
  ) : (
    <Badge variant="outline" className="px-2 py-0.5 text-[10px]">
      {t('common.workspace')}
    </Badge>
  );
  const guestsStatusBadge = sharesQuery.isLoading ? (
    <Badge variant="secondary" className="gap-1 px-2 py-0.5 text-[10px]">
      <Loader2 className="h-3 w-3 animate-spin" />
      {t('common.loading')}
    </Badge>
  ) : shares.length ? (
    <Badge variant="secondary" className="px-2 py-0.5 text-[10px]">
      {shares.length}
    </Badge>
  ) : (
    <Badge variant="outline" className="px-2 py-0.5 text-[10px]">
      {t('common.none')}
    </Badge>
  );
  const canSubmit =
    email.trim().length > 0 &&
    !createMutation.isPending &&
    !sharesQuery.isLoading;
  const permissionOptions = [
    {
      value: 'view',
      label: t('ws-task-boards.share.permission.view'),
    },
    {
      value: 'edit',
      label: t('ws-task-boards.share.permission.edit'),
    },
  ];

  return (
    <div className="space-y-2">
      <BoardPublicLinkSection boardId={board.id} open={enabled} wsId={wsId} />

      <ShareSection
        open={membersOpen}
        onOpenChange={setMembersOpen}
        title={t('ws-task-boards.share.workspace_members.title')}
        tooltip={t('ws-task-boards.share.workspace_members.tooltip')}
        icon={<Users className="h-4 w-4 text-muted-foreground" />}
        statusBadge={membersStatusBadge}
      >
        {viewableMembersQuery.isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('common.loading')}
          </div>
        ) : (members ?? []).length === 0 ? (
          <div className="text-muted-foreground text-sm">
            {t('ws-task-boards.share.workspace_members.empty')}
          </div>
        ) : (
          <div className="divide-y rounded-md border">
            {members?.map((member) => (
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
                      {t('ws-task-boards.share.workspace_members.creator')}
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
      </ShareSection>

      <ShareSection
        open={guestsOpen}
        onOpenChange={setGuestsOpen}
        title={t('ws-task-boards.share.guests.title')}
        tooltip={t('ws-task-boards.share.guests.tooltip')}
        icon={<Users className="h-4 w-4 text-muted-foreground" />}
        statusBadge={guestsStatusBadge}
      >
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_8rem_auto]">
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={t('ws-task-boards.share.email_placeholder')}
            />
            <Combobox
              mode="single"
              options={permissionOptions}
              selected={permission}
              onChange={(value) =>
                setPermission(value as WorkspaceTaskBoardSharePermission)
              }
              placeholder={t('ws-task-boards.share.permission.view')}
              searchPlaceholder={t('common.search_members')}
              className="[&_button]:h-9"
            />
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
                      <AvatarImage src={share.user?.avatar_url ?? undefined} />
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

                  <Combobox
                    mode="single"
                    options={permissionOptions}
                    selected={share.permission}
                    onChange={(value) =>
                      updateMutation.mutate({
                        shareId: share.id,
                        nextPermission:
                          value as WorkspaceTaskBoardSharePermission,
                      })
                    }
                    placeholder={t('ws-task-boards.share.permission.view')}
                    searchPlaceholder={t('common.search_members')}
                    className="w-28 [&_button]:h-9"
                  />

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
      </ShareSection>
    </div>
  );
}
