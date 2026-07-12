'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link2, Loader2, Search } from '@tuturuuu/icons';
import type { WorkspaceUserLinkCandidate } from '@tuturuuu/internal-api/users';
import {
  linkWorkspaceUserPlatformProfile,
  listWorkspaceUserLinkCandidates,
} from '@tuturuuu/internal-api/users';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@tuturuuu/ui/alert-dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useDeferredValue, useState } from 'react';

type Manager = NonNullable<UserGroup['managers']>[number];

function label(manager: Manager) {
  return (
    manager.full_name || manager.display_name || manager.email || manager.id
  );
}

export function ManagerLinkDialog({
  groupId,
  manager,
  wsId,
}: {
  groupId: string;
  manager: Manager;
  wsId: string;
}) {
  const t = useTranslations('user-group-data-table');
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [candidateToConfirm, setCandidateToConfirm] =
    useState<WorkspaceUserLinkCandidate | null>(null);
  const deferredQuery = useDeferredValue(query);
  const candidatesQuery = useQuery({
    queryKey: [
      'workspace-user-link-candidates',
      wsId,
      manager.id,
      deferredQuery,
    ],
    queryFn: () =>
      listWorkspaceUserLinkCandidates(wsId, manager.id, deferredQuery),
    enabled: open,
  });
  const linkMutation = useMutation({
    mutationFn: (platformUserId: string) =>
      linkWorkspaceUserPlatformProfile(wsId, {
        groupId,
        platformUserId,
        virtualUserId: manager.id,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['workspace-user-groups', wsId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['workspace-user-groups-infinite', wsId],
        }),
      ]);
      toast.success(t('manager_link_success'));
      setCandidateToConfirm(null);
      setOpen(false);
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : t('manager_link_error')
      ),
  });

  const candidates = candidatesQuery.data?.data ?? [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5">
          <Link2 className="h-3.5 w-3.5" />
          {t('manager_link_action')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('manager_link_title')}</DialogTitle>
          <DialogDescription>
            {t('manager_link_description', { manager: label(manager) })}
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder={t('manager_link_search')}
            className="pl-9"
          />
        </div>

        <div className="max-h-[min(55vh,28rem)] space-y-2 overflow-y-auto pr-1">
          {candidatesQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('manager_link_loading')}
            </div>
          ) : candidatesQuery.isError ? (
            <div className="space-y-3 rounded-lg border border-dynamic-red/30 bg-dynamic-red/5 p-4">
              <p className="text-sm">{t('manager_link_load_error')}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => candidatesQuery.refetch()}
              >
                {t('manager_link_retry')}
              </Button>
            </div>
          ) : candidates.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm">
              {t('manager_link_empty')}
            </p>
          ) : (
            candidates.map((candidate) => {
              const usesExistingProfile = Boolean(
                candidate.linkedVirtualUserId &&
                  candidate.linkedVirtualUserId !== manager.id
              );
              return (
                <div
                  key={candidate.id}
                  className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={candidate.avatarUrl || undefined} />
                      <AvatarFallback>
                        {(candidate.displayName || candidate.email || '?')[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-medium text-sm">
                          {candidate.displayName ||
                            candidate.email ||
                            candidate.id}
                        </p>
                        {candidate.isEmailMatch ? (
                          <Badge variant="secondary">
                            {t('manager_link_email_match')}
                          </Badge>
                        ) : null}
                        {usesExistingProfile ? (
                          <Badge variant="outline">
                            {t('manager_link_already_used')}
                          </Badge>
                        ) : null}
                      </div>
                      {candidate.email ? (
                        <p className="truncate text-muted-foreground text-xs">
                          {candidate.email}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    disabled={linkMutation.isPending}
                    onClick={() => setCandidateToConfirm(candidate)}
                  >
                    {linkMutation.isPending ? (
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : null}
                    {usesExistingProfile
                      ? t('manager_link_consolidate')
                      : t('manager_link_confirm')}
                  </Button>
                </div>
              );
            })
          )}
        </div>
        <AlertDialog
          open={candidateToConfirm !== null}
          onOpenChange={(nextOpen) => {
            if (!nextOpen && !linkMutation.isPending) {
              setCandidateToConfirm(null);
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t('manager_link_confirm_title')}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {candidateToConfirm?.linkedVirtualUserId
                  ? t('manager_link_consolidate_description', {
                      account:
                        candidateToConfirm.displayName ||
                        candidateToConfirm.email ||
                        candidateToConfirm.id,
                      manager: label(manager),
                    })
                  : t('manager_link_confirm_description', {
                      account:
                        candidateToConfirm?.displayName ||
                        candidateToConfirm?.email ||
                        candidateToConfirm?.id ||
                        '',
                      manager: label(manager),
                    })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={linkMutation.isPending}>
                {t('manager_link_cancel')}
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={!candidateToConfirm || linkMutation.isPending}
                onClick={(event) => {
                  event.preventDefault();
                  if (candidateToConfirm) {
                    linkMutation.mutate(candidateToConfirm.id);
                  }
                }}
              >
                {linkMutation.isPending ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : null}
                {candidateToConfirm?.linkedVirtualUserId
                  ? t('manager_link_consolidate')
                  : t('manager_link_confirm')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
