'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, Mail, RefreshCw, X } from '@tuturuuu/icons';
import type { WorkspaceInvitationRecord } from '@tuturuuu/internal-api/workspaces';
import {
  acceptWorkspaceInvite,
  declineWorkspaceInvite,
  listWorkspaceInvitations,
} from '@tuturuuu/internal-api/workspaces';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '../button';
import { CommandGroup, CommandItem } from '../command';
import { WorkspaceIcon } from './workspace-select-icon';

export function useWorkspaceInvitations({
  cacheScope,
  enabled,
  onAccepted,
  onDeclined,
}: {
  cacheScope?: string;
  enabled: boolean;
  onAccepted: (invitation: WorkspaceInvitationRecord) => void;
  onDeclined: () => void;
}) {
  const queryClient = useQueryClient();
  const t = useTranslations();
  const query = useQuery({
    queryKey: ['workspace-invitations', ...(cacheScope ? [cacheScope] : [])],
    queryFn: async () => (await listWorkspaceInvitations()).invitations,
    enabled,
    retry: 1,
    staleTime: 30_000,
  });
  const invitations = query.data ?? [];
  const mutation = useMutation({
    mutationFn: async ({
      action,
      invitation,
    }: {
      action: 'accept' | 'decline';
      invitation: WorkspaceInvitationRecord;
    }) => {
      if (action === 'accept') {
        await acceptWorkspaceInvite(invitation.workspace.id);
      } else {
        await declineWorkspaceInvite(invitation.workspace.id);
      }
      return { action, invitation };
    },
    onSuccess: async ({ action, invitation }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['workspace-invitations'] }),
        queryClient.invalidateQueries({ queryKey: ['workspaces'] }),
        queryClient.invalidateQueries({ queryKey: ['user-workspaces'] }),
        queryClient.invalidateQueries({ queryKey: ['workspace-user'] }),
        queryClient.invalidateQueries({ queryKey: ['current-user'] }),
        queryClient.invalidateQueries({ queryKey: ['user'] }),
        queryClient.invalidateQueries({ queryKey: ['notifications'] }),
      ]);

      if (action === 'accept') {
        toast.success(t('workspace-invitation.accept-success'));
        onAccepted(invitation);
      } else {
        toast.success(t('workspace-invitation.decline-success'));
        onDeclined();
      }
    },
    onError: (error, { action }) => {
      toast.error(
        t(
          action === 'accept'
            ? 'workspace-invitation.accept-error'
            : 'workspace-invitation.decline-error'
        ),
        {
          description: error instanceof Error ? error.message : undefined,
        }
      );
    },
  });

  return { invitations, mutation, query };
}

export function WorkspaceInvitationItems({
  controller,
  fallbackLogoUrl,
}: {
  controller: ReturnType<typeof useWorkspaceInvitations>;
  fallbackLogoUrl: string;
}) {
  const t = useTranslations();
  const { invitations, mutation, query } = controller;

  return (
    <>
      {invitations.length > 0 && (
        <CommandGroup
          heading={`${t('workspace-invitation.list-eyebrow')} (${invitations.length})`}
        >
          {invitations.map((invitation) => {
            const workspaceName =
              invitation.workspace.name ||
              invitation.workspace.handle ||
              invitation.workspace.id;
            const isPending =
              mutation.isPending &&
              mutation.variables?.invitation.workspace.id ===
                invitation.workspace.id;

            return (
              <div
                className="flex items-stretch gap-1 [&:has([cmdk-item][hidden])]:hidden"
                key={`${invitation.workspace.id}-${invitation.source}`}
              >
                <CommandItem
                  className="min-w-0 flex-1 gap-2"
                  disabled={isPending}
                  onSelect={() =>
                    mutation.mutate({ action: 'accept', invitation })
                  }
                  value={`${workspaceName} ${invitation.workspace.handle || ''} ${invitation.source} ${invitation.type}`}
                >
                  <WorkspaceIcon
                    avatarUrl={
                      invitation.workspace.avatar_url ||
                      invitation.workspace.logo_url
                    }
                    fallbackLogoUrl={fallbackLogoUrl}
                    name={workspaceName}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs">{workspaceName}</div>
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Mail className="size-3" />
                      {t(
                        `workspace-invitation.${
                          invitation.source === 'email'
                            ? 'email-invite'
                            : 'direct-invite'
                        }`
                      )}
                      <span aria-hidden="true">·</span>
                      {invitation.type === 'GUEST'
                        ? t('common.guest_access')
                        : t('common.members')}
                    </div>
                  </div>
                  {isPending && mutation.variables?.action === 'accept' ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Check className="size-3.5" />
                  )}
                  <span className="sr-only">
                    {t('workspace-invitation.accept')}
                  </span>
                </CommandItem>
                <Button
                  aria-label={t('workspace-invitation.reject')}
                  className="size-8 self-center"
                  disabled={isPending}
                  onClick={() =>
                    mutation.mutate({ action: 'decline', invitation })
                  }
                  size="icon"
                  title={t('workspace-invitation.reject')}
                  type="button"
                  variant="ghost"
                >
                  {isPending && mutation.variables?.action === 'decline' ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <X className="size-3.5" />
                  )}
                </Button>
              </div>
            );
          })}
        </CommandGroup>
      )}
      {query.isError && (
        <CommandGroup>
          <CommandItem
            onSelect={() => query.refetch()}
            value="retry workspace invitations"
          >
            {query.isFetching ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            {t('common.retry')}
          </CommandItem>
        </CommandGroup>
      )}
    </>
  );
}
