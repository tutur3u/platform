'use client';

import { useMutation } from '@tanstack/react-query';
import { ArrowRight } from '@tuturuuu/icons';
import {
  acceptWorkspaceInvite,
  declineWorkspaceInvite,
} from '@tuturuuu/internal-api';
import type { Workspace } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import { toast } from '@tuturuuu/ui/sonner';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  WorkspaceJoinCardSurface,
  WorkspaceJoinExperienceRoot,
  WorkspaceJoinLogoBlock,
  WorkspaceJoinSparkles,
} from '@/components/workspace-invite/workspace-join-experience';

const guestJoinErrorCodeSet = new Set([
  'NO_EMAIL',
  'NO_MATCHING_WORKSPACE_USER',
  'WORKSPACE_USER_LINKED_TO_OTHER_PLATFORM_USER',
  'NO_GUEST_SELF_JOIN_MATCH',
]);

interface WorkspaceInvitationProps {
  workspace: Workspace;
  inviterName?: string;
  allowGuestSelfJoin?: boolean;
}

export default function InvitationCard({
  workspace,
  inviterName,
  allowGuestSelfJoin = false,
}: WorkspaceInvitationProps) {
  const router = useRouter();
  const t = useTranslations();

  const acceptInviteSuccessTitle = t('invite.accept-invite-success-title');
  const acceptInviteSuccessMessage = t('invite.accept-invite-success-msg');

  const acceptInviteErrorTitle = t('invite.accept-invite-error-title');
  const acceptInviteErrorMessage = t('invite.accept-invite-error-msg');
  const guestJoinErrorTitle = t('invite.guest-join-error-title');
  const guestJoinErrorMessage = t('invite.guest-join-error-msg');

  const declineInviteSuccessTitle = t('invite.decline-invite-success-title');
  const declineInviteSuccessMessage = t('invite.decline-invite-success-msg');

  const declineInviteErrorTitle = t('invite.decline-invite-error-title');
  const declineInviteErrorMessage = t('invite.decline-invite-error-msg');

  const acceptMutation = useMutation({
    mutationFn: () => acceptWorkspaceInvite(workspace.id),
    onSuccess: () => {
      toast.success(acceptInviteSuccessTitle, {
        description: acceptInviteSuccessMessage,
      });
      router.refresh();
    },
    onError: (error) => {
      const err = error as Error & { errorCode?: string };
      const shouldShowGuestError =
        allowGuestSelfJoin &&
        err.errorCode &&
        guestJoinErrorCodeSet.has(err.errorCode);
      toast.error(
        shouldShowGuestError ? guestJoinErrorTitle : acceptInviteErrorTitle,
        {
          description: shouldShowGuestError
            ? guestJoinErrorMessage
            : acceptInviteErrorMessage,
        }
      );
    },
  });

  const declineMutation = useMutation({
    mutationFn: () => declineWorkspaceInvite(workspace.id),
    onSuccess: () => {
      toast.success(declineInviteSuccessTitle, {
        description: declineInviteSuccessMessage,
      });
      router.push('/onboarding');
      router.refresh();
    },
    onError: () => {
      toast.error(declineInviteErrorTitle, {
        description: declineInviteErrorMessage,
      });
    },
  });

  const loading =
    (acceptMutation.isPending && 'accept') ||
    (declineMutation.isPending && 'decline') ||
    undefined;

  const displayName = workspace.name?.trim() || t('common.workspace');

  return (
    <WorkspaceJoinExperienceRoot>
      <WorkspaceJoinCardSurface hoverShadow="blue">
        <WorkspaceJoinSparkles />

        <WorkspaceJoinLogoBlock workspace={workspace} />

        <div className="relative mb-8 space-y-4 text-center">
          <div className="space-y-2">
            <h1 className="bg-linear-to-br from-foreground to-foreground/70 bg-clip-text font-bold text-3xl text-transparent">
              {displayName}
            </h1>
            <p className="text-foreground/70 text-lg">
              {inviterName ? (
                <>
                  <span className="font-medium text-foreground">
                    {inviterName}
                  </span>{' '}
                  {t('invite.invited-you')}.
                </>
              ) : allowGuestSelfJoin ? (
                t('invite.workspace-guest-join')
              ) : (
                <>{t('invite.workspace-invitation')}.</>
              )}
            </p>
          </div>

          <p className="mx-auto max-w-sm text-foreground/65 text-sm leading-relaxed">
            {allowGuestSelfJoin
              ? t('invite.join-as-guest-description', {
                  workspace: displayName,
                })
              : t('invite.you-been-invited-to-join-the', {
                  workspace: displayName,
                })}
          </p>
        </div>

        <div className="relative mt-2 flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-stretch">
          <Button
            variant="outline"
            size="lg"
            className="border-foreground/15 transition-colors hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive sm:flex-1"
            onClick={() => declineMutation.mutate()}
            disabled={!!loading}
          >
            {loading === 'decline' ? (
              <LoadingIndicator />
            ) : (
              t('invite.decline-invite')
            )}
          </Button>
          <Button
            size="lg"
            className="group/btn relative overflow-hidden bg-linear-to-r from-dynamic-blue to-dynamic-purple shadow-lg transition-all duration-300 hover:shadow-dynamic-blue/20 hover:shadow-xl sm:flex-[1.35]"
            onClick={() => acceptMutation.mutate()}
            disabled={!!loading}
          >
            <span className="relative z-10 flex items-center justify-center gap-2 font-semibold">
              {loading === 'accept' ? (
                <LoadingIndicator className="text-background" />
              ) : (
                <>
                  {allowGuestSelfJoin
                    ? t('invite.join-as-guest-button')
                    : t('invite.accept-invite')}
                  <ArrowRight className="h-5 w-5 transition-transform group-hover/btn:translate-x-1" />
                </>
              )}
            </span>
            <div className="pointer-events-none absolute inset-0 bg-linear-to-r from-dynamic-purple to-dynamic-pink opacity-0 transition-opacity group-hover/btn:opacity-100" />
          </Button>
        </div>
      </WorkspaceJoinCardSurface>

      <p className="text-center text-foreground/50 text-sm leading-relaxed">
        {t('invite.join-agreement')}
      </p>
    </WorkspaceJoinExperienceRoot>
  );
}
