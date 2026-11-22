'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  acceptWorkspaceInvite,
  listWorkspaceInvitations,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { getInitials } from '@tuturuuu/utils/name-helper';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { InlineAlert } from './welcome-controls';

const INVITATIONS_KEY = ['onboarding-welcome', 'invitations'] as const;

export type JoinedWorkspace = { id: string; name: string };

/**
 * Pending invitations as cards with a Join button, through the existing
 * invitation and accept APIs. Nothing renders when there are none.
 */
export function SpaceInvites({
  onJoined,
}: {
  onJoined: (workspace: JoinedWorkspace) => void;
}) {
  const t = useTranslations('onboarding_flow');
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState<ReadonlySet<string>>(new Set());

  const invitations = useQuery({
    queryFn: () => listWorkspaceInvitations(),
    queryKey: INVITATIONS_KEY,
    staleTime: 30_000,
  });

  const join = useMutation({
    mutationFn: async (workspace: JoinedWorkspace) => {
      await acceptWorkspaceInvite(workspace.id);
      return workspace;
    },
    onError: () => setError(t('join_error')),
    onSuccess: (workspace) => {
      setError(null);
      setJoined((current) => new Set(current).add(workspace.id));
      onJoined(workspace);
      void queryClient.invalidateQueries({ queryKey: INVITATIONS_KEY });
    },
  });

  const pending = (invitations.data?.invitations ?? []).filter(
    ({ workspace }) => !workspace.personal && workspace.id
  );
  if (pending.length === 0 && joined.size === 0) return null;

  return (
    <div className="flex flex-col gap-2.5">
      {pending.map(({ workspace }) => {
        const name = workspace.name?.trim() || t('invite_unnamed');
        return (
          <div
            className="flex items-center gap-3 rounded-2xl bg-calendar-bg-green px-3.5 py-3"
            key={workspace.id}
          >
            <span
              aria-hidden="true"
              className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-card font-bold text-dynamic-green text-sm"
            >
              {getInitials(name)}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-semibold text-sm">
                {t('invite_title', { workspace: name })}
              </span>
              <span className="text-muted-foreground text-xs">
                {t('invite_subtitle')}
              </span>
            </span>
            <Button
              className="h-9 rounded-full px-4"
              disabled={join.isPending}
              onClick={() => join.mutate({ id: workspace.id, name })}
              size="sm"
              type="button"
            >
              {t('join')}
            </Button>
          </div>
        );
      })}
      {joined.size > 0 ? (
        <p className="text-dynamic-green text-sm" role="status">
          {t('joined')}
        </p>
      ) : null}
      <InlineAlert message={error} />
    </div>
  );
}
