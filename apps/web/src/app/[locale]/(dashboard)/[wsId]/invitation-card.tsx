'use client';

import { Workspace } from '@ncthub/types/db';
import { Avatar, AvatarFallback, AvatarImage } from '@ncthub/ui/avatar';
import { Button } from '@ncthub/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@ncthub/ui/card';
import { LoadingIndicator } from '@ncthub/ui/custom/loading-indicator';
import { toast } from '@ncthub/ui/hooks/use-toast';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface WorkspaceInvitationProps {
  workspace: Workspace;
  inviterName?: string;
}

export default function InvitationCard({
  workspace,
  inviterName,
}: WorkspaceInvitationProps) {
  const router = useRouter();
  const t = useTranslations();

  const [loading, setLoading] = useState<'accept' | 'decline' | undefined>();

  const acceptInviteSuccessTitle = t('invite.accept-invite-success-title');
  const acceptInviteSuccessMessage = t('invite.accept-invite-success-msg');

  const acceptInviteErrorTitle = t('invite.accept-invite-error-title');
  const acceptInviteErrorMessage = t('invite.accept-invite-error-msg');

  const declineInviteSuccessTitle = t('invite.decline-invite-success-title');
  const declineInviteSuccessMessage = t('invite.decline-invite-success-msg');

  const declineInviteErrorTitle = t('invite.decline-invite-error-title');
  const declineInviteErrorMessage = t('invite.decline-invite-error-msg');

  const acceptInvite = async (ws: Workspace) => {
    setLoading('accept');
    const response = await fetch(`/api/workspaces/${ws.id}/accept-invite`, {
      method: 'POST',
    });

    if (response.ok) {
      toast({
        title: acceptInviteSuccessTitle,
        description: acceptInviteSuccessMessage,
        color: 'teal',
      });
      router.refresh();
    } else {
      setLoading(undefined);
      toast({
        title: acceptInviteErrorTitle,
        description: acceptInviteErrorMessage,
        color: 'red',
      });
    }
  };

  const declineInvite = async (ws: Workspace) => {
    setLoading('decline');
    const response = await fetch(`/api/workspaces/${ws.id}/decline-invite`, {
      method: 'POST',
    });

    if (response.ok) {
      toast({
        title: declineInviteSuccessTitle,
        description: declineInviteSuccessMessage,
        color: 'teal',
      });
      router.push('/onboarding');
      router.refresh();
    } else {
      setLoading(undefined);
      toast({
        title: declineInviteErrorTitle,
        description: declineInviteErrorMessage,
        color: 'red',
      });
    }
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader className="flex flex-row items-center gap-2">
        <Avatar className="h-12 w-12">
          <AvatarImage
            src={
              workspace.name
                ? `https://avatar.vercel.sh/${workspace.name}.png`
                : undefined
            }
            alt={workspace.name ?? ''}
          />
          <AvatarFallback>
            {workspace.name?.slice(0, 2).toUpperCase() || 'WS'}
          </AvatarFallback>
        </Avatar>
        <div>
          <CardTitle>{workspace.name}</CardTitle>
          <CardDescription>
            {inviterName
              ? `${inviterName} ${t('invite.invited-you')}`
              : t('invite.workspace-invitation')}
            .
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          {t('invite.you-been-invited-to-join-the')}{' '}
          <span className="text-foreground underline">{workspace.name}</span>
          {t('invite.accept-to-start-collaborating')}
        </p>
      </CardContent>
      <CardFooter className="flex justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => declineInvite(workspace)}
          className="transition-colors hover:bg-destructive hover:text-destructive-foreground"
          disabled={!!loading}
        >
          {loading === 'decline' ? (
            <LoadingIndicator />
          ) : (
            t('invite.decline-invite')
          )}
        </Button>
        <Button
          onClick={() => acceptInvite(workspace)}
          className="transition-colors"
          disabled={!!loading}
        >
          {loading === 'accept' ? (
            <LoadingIndicator className="text-background" />
          ) : (
            t('invite.accept-invite')
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}
