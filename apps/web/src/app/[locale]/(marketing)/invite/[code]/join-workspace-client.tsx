'use client';

import {
  AlertTriangle,
  ArrowRight,
  Check,
  Loader2,
  Users,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  WorkspaceJoinCardSurface,
  WorkspaceJoinExperienceRoot,
  WorkspaceJoinLogoBlock,
  WorkspaceJoinSparkles,
} from '@/components/workspace-invite/workspace-join-experience';
import type { Workspace, WorkspaceInfo } from '@/lib/invite/types';

interface Props {
  code: string;
  workspaceInfo: WorkspaceInfo | null;
  alreadyMember?: boolean;
  workspace?: Workspace;
}

export default function JoinWorkspaceClient({
  code,
  workspaceInfo,
  alreadyMember = false,
  workspace: memberWorkspace,
}: Props) {
  const router = useRouter();
  const t = useTranslations('invite');
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);

  const handleJoin = async () => {
    setJoining(true);

    const errorCodeMap: Record<string, string> = {
      INVITE_CODE_REQUIRED: 'error-invite-code-required',
      INVITE_INVALID_OR_EXPIRED: 'error-invite-invalid-or-expired',
      INVITE_EXPIRED: 'error-invite-expired',
      INVITE_MAX_USES_REACHED: 'error-invite-max-uses-reached',
      INVITE_INVALID_WORKSPACE: 'error-invite-invalid-workspace',
      INTERNAL_ERROR: 'error-internal',
      UNAUTHORIZED: 'error-unauthorized',
      ALREADY_MEMBER: 'error-already-member',
      JOIN_FAILED: 'error-join-failed',
      SEAT_LIMIT_REACHED: 'error-seat-limit-reached',
    };

    try {
      const response = await fetch(`/api/invite/${code}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setJoined(true);
        toast.success(t('join-success-toast'));

        setTimeout(() => {
          router.push(`/${data.workspace.id}`);
        }, 1500);
      } else {
        const error = await response.json();
        const errorMessage =
          error.errorCode && errorCodeMap[error.errorCode]
            ? t(errorCodeMap[error.errorCode as any] as any)
            : t('join-error-toast');
        toast.error(errorMessage);
        setJoining(false);
      }
    } catch (error) {
      console.error('Error joining workspace:', error);
      toast.error(t('unexpected-error-toast'));
      setJoining(false);
    }
  };

  const handleGoToWorkspace = () => {
    if (memberWorkspace) {
      router.push(`/${memberWorkspace.id}`);
    }
  };

  if (alreadyMember && memberWorkspace) {
    return (
      <WorkspaceJoinExperienceRoot>
        <WorkspaceJoinCardSurface hoverShadow="green">
          <WorkspaceJoinLogoBlock
            workspace={memberWorkspace}
            ringAccent="green"
          />

          <div className="relative mb-8 space-y-3 text-center">
            <h1 className="bg-linear-to-br from-foreground to-foreground/70 bg-clip-text font-bold text-3xl text-transparent">
              {t('already-member-title')}
            </h1>
            <div className="space-y-2">
              <p className="text-foreground/80 text-lg">
                {t('already-member-welcome')}{' '}
                <span className="font-semibold text-foreground">
                  {memberWorkspace.name}
                </span>
              </p>
              <p className="mx-auto max-w-sm text-foreground/60 text-sm leading-relaxed">
                {t('already-member-description')}
              </p>
            </div>
          </div>

          <Button
            className="group/btn relative w-full overflow-hidden bg-linear-to-r from-dynamic-blue to-dynamic-purple shadow-lg transition-all duration-300 hover:shadow-dynamic-blue/20 hover:shadow-xl"
            size="lg"
            onClick={handleGoToWorkspace}
          >
            <span className="relative z-10 flex items-center justify-center gap-2">
              {t('go-to-workspace')}
              <ArrowRight className="h-5 w-5 transition-transform group-hover/btn:translate-x-1" />
            </span>
            <div className="pointer-events-none absolute inset-0 bg-linear-to-r from-dynamic-purple to-dynamic-pink opacity-0 transition-opacity group-hover/btn:opacity-100" />
          </Button>
        </WorkspaceJoinCardSurface>

        <div className="space-y-2 text-center">
          <p className="text-foreground/50 text-sm">{t('need-help')}</p>
        </div>
      </WorkspaceJoinExperienceRoot>
    );
  }

  if (!workspaceInfo) {
    return null;
  }

  const {
    workspace,
    memberCount,
    seatLimitReached,
    seatStatus,
    memberType = 'MEMBER',
  } = workspaceInfo;

  return (
    <WorkspaceJoinExperienceRoot>
      <WorkspaceJoinCardSurface hoverShadow="blue">
        {!joined && <WorkspaceJoinSparkles />}

        <WorkspaceJoinLogoBlock workspace={workspace} joined={joined} />

        <div className="relative mb-8 space-y-4 text-center">
          <div className="space-y-2">
            <h1 className="bg-linear-to-br from-foreground to-foreground/70 bg-clip-text font-bold text-3xl text-transparent">
              {workspace.name}
            </h1>
            <p className="text-foreground/70 text-lg">
              {joined ? t('welcome-aboard') : t('invited-to-join')}
            </p>
          </div>

          {!joined && (
            <div className="flex flex-col items-center gap-3">
              <div className="flex flex-wrap items-center justify-center gap-3">
                <div className="flex items-center gap-1.5 rounded-full bg-dynamic-purple/10 px-3 py-1.5 text-sm">
                  <Users className="h-4 w-4 text-dynamic-purple" />
                  <span className="font-medium text-foreground/80">
                    {memberCount}{' '}
                    {memberCount === 1 ? t('member') : t('members')}
                  </span>
                </div>
              </div>
              <p className="max-w-sm text-center text-foreground/65 text-sm leading-relaxed">
                {memberType === 'GUEST'
                  ? t('join-as-guest-hint')
                  : t('join-as-member-hint')}
              </p>
            </div>
          )}

          {!joined && seatLimitReached && (
            <div className="mt-4 rounded-lg border border-dynamic-orange/30 bg-dynamic-orange/10 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-dynamic-orange" />
                <div className="space-y-1">
                  <p className="font-medium text-foreground text-sm">
                    {t('seat-limit-reached-title')}
                  </p>
                  <p className="text-foreground/70 text-xs">
                    {seatStatus?.maxSeats
                      ? t('seat-limit-reached-description-with-count', {
                          current: seatStatus.currentSeats,
                          max: seatStatus.maxSeats,
                        })
                      : t('seat-limit-reached-description')}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <Button
          className={`group/btn relative w-full overflow-hidden shadow-lg transition-all duration-300 ${
            joined
              ? 'bg-dynamic-green hover:bg-dynamic-green'
              : seatLimitReached
                ? 'cursor-not-allowed bg-foreground/20'
                : 'bg-linear-to-r from-dynamic-blue to-dynamic-purple hover:shadow-dynamic-blue/20 hover:shadow-xl'
          }`}
          size="lg"
          onClick={handleJoin}
          disabled={joining || joined || seatLimitReached}
        >
          <span className="relative z-10 flex items-center justify-center gap-2 font-semibold">
            {joined ? (
              <>
                <Check className="zoom-in h-5 w-5 animate-in" strokeWidth={3} />
                {t('joined-successfully')}
              </>
            ) : joining ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                {t('joining-workspace')}
              </>
            ) : seatLimitReached ? (
              <>
                <AlertTriangle className="h-5 w-5" />
                {t('workspace-full')}
              </>
            ) : (
              <>
                {t('join-workspace')}
                <ArrowRight className="h-5 w-5 transition-transform group-hover/btn:translate-x-1" />
              </>
            )}
          </span>
          {!joined && !joining && !seatLimitReached && (
            <div className="pointer-events-none absolute inset-0 bg-linear-to-r from-dynamic-purple to-dynamic-pink opacity-0 transition-opacity group-hover/btn:opacity-100" />
          )}
        </Button>

        {joined && (
          <div className="fade-in slide-in-from-bottom-2 mt-6 animate-in">
            <div className="flex items-center justify-center gap-2 text-foreground/60 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{t('redirecting')}</span>
            </div>
          </div>
        )}
      </WorkspaceJoinCardSurface>

      {!joined && (
        <div className="space-y-2 text-center">
          <p className="text-foreground/50 text-sm leading-relaxed">
            {t('join-agreement')}
          </p>
        </div>
      )}
    </WorkspaceJoinExperienceRoot>
  );
}
