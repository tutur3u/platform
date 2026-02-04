'use client';

import {
  AlertTriangle,
  ArrowRight,
  Check,
  Loader2,
  Sparkles,
  Users,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleJoin = async () => {
    setJoining(true);

    // Map error codes to translation keys
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

        // Redirect to workspace after a brief delay (removed router.refresh() to prevent infinite loop)
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

  // Already a member view
  if (alreadyMember && memberWorkspace) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
        {/* Animated background elements */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute top-1/4 right-1/4 h-64 w-64 animate-pulse rounded-full bg-dynamic-blue/5 blur-3xl" />
          <div className="animation-delay-2000 absolute bottom-1/4 left-1/4 h-64 w-64 animate-pulse rounded-full bg-dynamic-purple/5 blur-3xl" />
        </div>

        <div
          className={`relative w-full max-w-md space-y-6 transition-all duration-700 ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}
        >
          <div className="group relative overflow-hidden rounded-2xl border border-foreground/10 bg-background/80 p-8 shadow-2xl backdrop-blur-xl transition-all duration-300 hover:border-foreground/20 hover:shadow-dynamic-green/10">
            {/* Shine effect */}
            <div className="pointer-events-none absolute inset-0 bg-linear-to-br from-transparent via-white/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

            {/* Workspace Avatar/Logo */}
            <div className="mb-8 flex justify-center">
              <div className="relative">
                {memberWorkspace.logo_url || memberWorkspace.avatar_url ? (
                  <div className="relative overflow-hidden rounded-2xl ring-4 ring-dynamic-green/20 ring-offset-4 ring-offset-background">
                    <Image
                      src={
                        memberWorkspace.logo_url! || memberWorkspace.avatar_url!
                      }
                      alt={memberWorkspace.name}
                      className="h-24 w-24 object-cover transition-transform duration-300 group-hover:scale-110"
                      width={96}
                      height={96}
                    />
                  </div>
                ) : (
                  <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-linear-to-br from-dynamic-blue via-dynamic-purple to-dynamic-pink shadow-lg ring-4 ring-dynamic-green/20 ring-offset-4 ring-offset-background transition-transform duration-300 group-hover:scale-110">
                    <span className="font-bold text-4xl text-white drop-shadow-lg">
                      {memberWorkspace.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Already Member Info */}
            <div className="mb-8 space-y-3 text-center">
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

            {/* Go to Workspace Button */}
            <Button
              className="group/btn relative w-full overflow-hidden bg-linear-to-r from-dynamic-blue to-dynamic-purple shadow-lg transition-all duration-300 hover:shadow-dynamic-blue/20 hover:shadow-xl"
              size="lg"
              onClick={handleGoToWorkspace}
            >
              <span className="relative z-10 flex items-center justify-center gap-2">
                {t('go-to-workspace')}
                <ArrowRight className="h-5 w-5 transition-transform group-hover/btn:translate-x-1" />
              </span>
              <div className="absolute inset-0 bg-linear-to-r from-dynamic-purple to-dynamic-pink opacity-0 transition-opacity group-hover/btn:opacity-100" />
            </Button>
          </div>

          {/* Footer */}
          <div className="space-y-2 text-center">
            <p className="text-foreground/50 text-sm">{t('need-help')}</p>
          </div>
        </div>
      </div>
    );
  }

  // Join workspace view (for non-members)
  if (!workspaceInfo) {
    return null;
  }

  const { workspace, memberCount, seatLimitReached, seatStatus } =
    workspaceInfo;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      {/* Animated background elements */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-1/4 right-1/4 h-96 w-96 animate-pulse rounded-full bg-dynamic-blue/5 blur-3xl" />
        <div className="animation-delay-2000 absolute bottom-1/4 left-1/4 h-96 w-96 animate-pulse rounded-full bg-dynamic-purple/5 blur-3xl" />
        <div className="animation-delay-4000 absolute top-1/2 left-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full bg-dynamic-pink/5 blur-3xl" />
      </div>

      <div
        className={`relative w-full max-w-md space-y-6 transition-all duration-700 ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}
      >
        <div className="group relative overflow-hidden rounded-2xl border border-foreground/10 bg-background/80 p-8 shadow-2xl backdrop-blur-xl transition-all duration-300 hover:border-foreground/20 hover:shadow-dynamic-blue/10">
          {/* Shine effect */}
          <div className="pointer-events-none absolute inset-0 bg-linear-to-br from-transparent via-white/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

          {/* Sparkle decoration */}
          {!joined && (
            <div className="absolute top-4 right-4">
              <Sparkles className="h-5 w-5 animate-pulse text-dynamic-blue/40" />
            </div>
          )}

          {/* Workspace Avatar/Logo */}
          <div className="mb-8 flex justify-center">
            <div className="relative">
              {workspace.logo_url || workspace.avatar_url ? (
                <div className="relative overflow-hidden rounded-2xl ring-4 ring-dynamic-blue/20 ring-offset-4 ring-offset-background transition-all duration-300 group-hover:ring-dynamic-blue/30">
                  <Image
                    src={workspace.logo_url! || workspace.avatar_url!}
                    alt={workspace.name}
                    className="h-24 w-24 object-cover transition-transform duration-300 group-hover:scale-110"
                    width={96}
                    height={96}
                  />
                </div>
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-linear-to-br from-dynamic-blue via-dynamic-purple to-dynamic-pink shadow-lg ring-4 ring-dynamic-blue/20 ring-offset-4 ring-offset-background transition-all duration-300 group-hover:scale-110 group-hover:ring-dynamic-blue/30">
                  <span className="font-bold text-4xl text-white drop-shadow-lg">
                    {workspace.name.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              {joined && (
                <div className="absolute -top-2 -right-2 animate-bounce rounded-full bg-dynamic-green p-2 shadow-lg ring-4 ring-background">
                  <Check className="h-5 w-5 text-white" strokeWidth={3} />
                </div>
              )}
            </div>
          </div>

          {/* Workspace Info */}
          <div className="mb-8 space-y-4 text-center">
            <div className="space-y-2">
              <h1 className="bg-linear-to-br from-foreground to-foreground/70 bg-clip-text font-bold text-3xl text-transparent">
                {workspace.name}
              </h1>
              <p className="text-foreground/70 text-lg">
                {joined ? t('welcome-aboard') : t('invited-to-join')}
              </p>
            </div>

            {!joined && (
              <div className="flex flex-wrap items-center justify-center gap-3">
                <div className="flex items-center gap-1.5 rounded-full bg-dynamic-purple/10 px-3 py-1.5 text-sm">
                  <Users className="h-4 w-4 text-dynamic-purple" />
                  <span className="font-medium text-foreground/80">
                    {memberCount}{' '}
                    {memberCount === 1 ? t('member') : t('members')}
                  </span>
                </div>
              </div>
            )}

            {/* Seat Limit Warning */}
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

          {/* Join Button */}
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
                  <Check
                    className="zoom-in h-5 w-5 animate-in"
                    strokeWidth={3}
                  />
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
              <div className="absolute inset-0 bg-linear-to-r from-dynamic-purple to-dynamic-pink opacity-0 transition-opacity group-hover/btn:opacity-100" />
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
        </div>

        {/* Footer */}
        {!joined && (
          <div className="space-y-2 text-center">
            <p className="text-foreground/50 text-sm leading-relaxed">
              {t('join-agreement')}
            </p>
          </div>
        )}
      </div>

      {/* Add CSS for animation delays */}
      <style jsx>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 0.5;
          }
          50% {
            opacity: 0.8;
          }
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
      `}</style>
    </div>
  );
}
