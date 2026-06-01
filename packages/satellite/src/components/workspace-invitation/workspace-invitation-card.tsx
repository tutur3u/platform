'use client';

import { useMutation } from '@tanstack/react-query';
import { ArrowRight, Check, Mail, X } from '@tuturuuu/icons';
import {
  acceptWorkspaceInvite,
  declineWorkspaceInvite,
  type WorkspaceInvitationRecord,
  type WorkspaceInvitationWorkspace,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
import { cn } from '@tuturuuu/utils/format';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

type WorkspaceInvitationCardProps = {
  afterDeclineHref?: string;
  className?: string;
  invitation: WorkspaceInvitationRecord;
  onDeclined?: (workspaceId: string) => void;
  workspaceHref?: string;
};

type WorkspaceInvitationListProps = {
  afterDeclineHref?: string;
  className?: string;
  invitations: WorkspaceInvitationRecord[];
  workspaceHref?: (workspace: WorkspaceInvitationWorkspace) => string;
};

function getWorkspaceName(workspace: WorkspaceInvitationWorkspace) {
  return workspace.name?.trim() || workspace.handle?.trim() || workspace.id;
}

export function SatelliteWorkspaceInvitationCard({
  afterDeclineHref = '/',
  className,
  invitation,
  onDeclined,
  workspaceHref,
}: WorkspaceInvitationCardProps) {
  const router = useRouter();
  const t = useTranslations('workspace-invitation');
  const workspace = invitation.workspace;
  const destination = workspaceHref ?? `/${workspace.id}`;
  const workspaceName = getWorkspaceName(workspace);
  const [isLeaving, setIsLeaving] = useState(false);

  const acceptMutation = useMutation({
    mutationFn: () => acceptWorkspaceInvite(workspace.id),
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('accept-error'));
    },
    onSuccess: () => {
      toast.success(t('accept-success'));
      setIsLeaving(true);
      router.push(destination);
      router.refresh();
    },
  });

  const declineMutation = useMutation({
    mutationFn: () => declineWorkspaceInvite(workspace.id),
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('decline-error'));
    },
    onSuccess: () => {
      toast.success(t('decline-success'));
      onDeclined?.(workspace.id);
      router.refresh();
      if (!onDeclined) {
        router.push(afterDeclineHref);
      }
    },
  });

  const busy =
    isLeaving || acceptMutation.isPending || declineMutation.isPending;
  const sourceLabel =
    invitation.source === 'email' ? t('email-invite') : t('direct-invite');

  return (
    <section
      className={cn(
        'mx-auto flex min-h-screen w-full max-w-2xl items-center justify-center px-4 py-10',
        className
      )}
    >
      <div className="w-full rounded-lg border bg-background p-6 shadow-sm sm:p-8">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border bg-muted">
            <Mail className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-muted-foreground text-sm">{sourceLabel}</p>
            <h1 className="mt-1 break-words font-semibold text-2xl tracking-normal">
              {t('title', { workspace: workspaceName })}
            </h1>
            <p className="mt-3 text-muted-foreground leading-7">
              {t('description')}
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button
            disabled={busy}
            onClick={() => declineMutation.mutate()}
            type="button"
            variant="outline"
          >
            <X className="mr-2 h-4 w-4" />
            {declineMutation.isPending ? t('rejecting') : t('reject')}
          </Button>
          <Button
            disabled={busy}
            onClick={() => acceptMutation.mutate()}
            type="button"
          >
            {acceptMutation.isPending || isLeaving ? (
              <Check className="mr-2 h-4 w-4" />
            ) : (
              <ArrowRight className="mr-2 h-4 w-4" />
            )}
            {acceptMutation.isPending || isLeaving
              ? t('accepting')
              : t('accept')}
          </Button>
        </div>
      </div>
    </section>
  );
}

export function SatelliteWorkspaceInvitationList({
  afterDeclineHref = '/',
  className,
  invitations,
  workspaceHref,
}: WorkspaceInvitationListProps) {
  const router = useRouter();
  const t = useTranslations('workspace-invitation');
  const [visibleInvitations, setVisibleInvitations] = useState(invitations);
  const invitationCount = visibleInvitations.length;
  const firstInvitation = visibleInvitations[0];
  const hrefForWorkspace = useMemo(
    () =>
      workspaceHref ??
      ((workspace: WorkspaceInvitationWorkspace) => `/${workspace.id}`),
    [workspaceHref]
  );

  useEffect(() => {
    if (invitationCount === 0) {
      router.push(afterDeclineHref);
      router.refresh();
    }
  }, [afterDeclineHref, invitationCount, router]);

  if (invitationCount === 0) {
    return null;
  }

  if (invitationCount === 1 && firstInvitation) {
    return (
      <SatelliteWorkspaceInvitationCard
        afterDeclineHref={afterDeclineHref}
        className={className}
        invitation={firstInvitation}
        onDeclined={() => {
          setVisibleInvitations([]);
          router.push(afterDeclineHref);
          router.refresh();
        }}
        workspaceHref={hrefForWorkspace(firstInvitation.workspace)}
      />
    );
  }

  return (
    <section
      className={cn(
        'mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-4 py-10',
        className
      )}
    >
      <div>
        <p className="text-muted-foreground text-sm">{t('list-eyebrow')}</p>
        <h1 className="mt-1 font-semibold text-2xl tracking-normal">
          {t('list-title')}
        </h1>
      </div>
      <div className="mt-6 grid gap-3">
        {visibleInvitations.map((invitation) => (
          <SatelliteWorkspaceInvitationCard
            key={`${invitation.workspace.id}-${invitation.source}`}
            afterDeclineHref={afterDeclineHref}
            className="min-h-0 max-w-none p-0"
            invitation={invitation}
            onDeclined={(workspaceId) => {
              setVisibleInvitations((current) => {
                const next = current.filter(
                  (candidate) => candidate.workspace.id !== workspaceId
                );

                if (next.length === 0) {
                  router.push(afterDeclineHref);
                  router.refresh();
                }

                return next;
              });
            }}
            workspaceHref={hrefForWorkspace(invitation.workspace)}
          />
        ))}
      </div>
    </section>
  );
}
