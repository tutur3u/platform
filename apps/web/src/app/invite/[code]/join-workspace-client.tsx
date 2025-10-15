'use client';

import type { Workspace, WorkspaceInfo } from '@/lib/invite/types';
import { ArrowRight, Check, Users } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

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
  workspace,
}: Props) {
  const router = useRouter();
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);

  const handleJoin = async () => {
    setJoining(true);

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
        toast.success('Successfully joined workspace!');

        // Redirect to workspace after a brief delay
        setTimeout(() => {
          router.push(`/${data.workspace.id}`);
          router.refresh();
        }, 1500);
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to join workspace');
        setJoining(false);
      }
    } catch (error) {
      console.error('Error joining workspace:', error);
      toast.error('An unexpected error occurred');
      setJoining(false);
    }
  };

  const handleGoToWorkspace = () => {
    if (workspace) {
      router.push(`/${workspace.id}`);
    }
  };

  // Already a member view
  if (alreadyMember && workspace) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background to-foreground/5 p-4">
        <div className="w-full max-w-md space-y-6">
          <div className="rounded-xl border bg-background/95 p-8 shadow-lg backdrop-blur">
            {/* Workspace Avatar/Logo */}
            <div className="mb-6 flex justify-center">
              {workspace.logo_url || workspace.avatar_url ? (
                <img
                  src={workspace.logo_url || workspace.avatar_url}
                  alt={workspace.name}
                  className="h-20 w-20 rounded-lg object-cover"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-gradient-to-br from-dynamic-blue to-dynamic-purple">
                  <span className="font-bold text-3xl text-white">
                    {workspace.name.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
            </div>

            {/* Already Member Info */}
            <div className="mb-6 text-center">
              <div className="mb-4 flex justify-center">
                <div className="rounded-full bg-dynamic-green/10 p-3">
                  <Check className="h-8 w-8 text-dynamic-green" />
                </div>
              </div>
              <h1 className="mb-2 font-bold text-2xl">
                You&apos;re Already a Member
              </h1>
              <p className="mb-2 text-foreground/60">
                You&apos;re already part of{' '}
                <span className="font-semibold text-foreground">
                  {workspace.name}
                </span>
              </p>
              <p className="text-foreground/60 text-sm">
                No need to join again. Click below to go to the workspace.
              </p>
            </div>

            {/* Go to Workspace Button */}
            <Button className="w-full" size="lg" onClick={handleGoToWorkspace}>
              Go to Workspace
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>

          {/* Footer */}
          <p className="text-center text-foreground/40 text-sm">
            Need help? Contact your workspace administrator.
          </p>
        </div>
      </div>
    );
  }

  // Join workspace view (for non-members)
  if (!workspaceInfo) {
    return null;
  }

  const { workspace: ws, memberCount, roleTitle } = workspaceInfo;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background to-foreground/5 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="rounded-xl border bg-background/95 p-8 shadow-lg backdrop-blur">
          {/* Workspace Avatar/Logo */}
          <div className="mb-6 flex justify-center">
            {ws.logo_url || ws.avatar_url ? (
              <img
                src={ws.logo_url || ws.avatar_url}
                alt={ws.name}
                className="h-20 w-20 rounded-lg object-cover"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-gradient-to-br from-dynamic-blue to-dynamic-purple">
                <span className="font-bold text-3xl text-white">
                  {ws.name.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
          </div>

          {/* Workspace Info */}
          <div className="mb-6 text-center">
            <h1 className="mb-2 font-bold text-2xl">{ws.name}</h1>
            <p className="mb-4 text-foreground/60">
              You&apos;ve been invited to join this workspace
            </p>

            <div className="flex items-center justify-center gap-6 text-sm">
              {roleTitle && (
                <div className="flex items-center gap-1 text-foreground/80">
                  <span className="font-semibold">Role:</span>
                  <span>{roleTitle}</span>
                </div>
              )}
              <div className="flex items-center gap-1 text-foreground/80">
                <Users className="h-4 w-4" />
                <span>{memberCount} members</span>
              </div>
            </div>
          </div>

          {/* Join Button */}
          <Button
            className="w-full"
            size="lg"
            onClick={handleJoin}
            disabled={joining || joined}
          >
            {joined ? (
              <>
                <Check className="mr-2 h-5 w-5" />
                Joined Successfully
              </>
            ) : joining ? (
              'Joining...'
            ) : (
              'Join Workspace'
            )}
          </Button>

          {joined && (
            <p className="mt-4 text-center text-foreground/60 text-sm">
              Redirecting you to the workspace...
            </p>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-foreground/40 text-sm">
          By joining, you agree to be part of this workspace and follow its
          guidelines.
        </p>
      </div>
    </div>
  );
}
