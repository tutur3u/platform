'use client';

import { fetchTeamInvitations, respondToInvitation } from './actions';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { Check, Inbox, Shield, X } from '@tuturuuu/ui/icons';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { formatDistanceToNow } from 'date-fns';
import { useTranslations } from 'next-intl';

export const TeamInvitation = () => {
  const t = useTranslations();
  const queryClient = useQueryClient();

  // Fetch invitations
  const {
    data: invitations = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['teamInvitations'],
    queryFn: fetchTeamInvitations,
  });

  // Mutation for responding invitations
  const { mutate, isPending } = useMutation({
    mutationFn: respondToInvitation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teamInvitations'] });
      queryClient.invalidateQueries({ queryKey: ['userTeams'] });
    },
    onError: (error) => {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Handle accept invitation
  const handleAccept = (teamId: string) => {
    mutate(
      { teamId, action: 'accept' },
      {
        onSuccess: () => {
          toast({
            title: 'Accepted',
            description: 'Accepted successfully',
          });
        },
      }
    );
  };

  // Handle decline invitation
  const handleDecline = (teamId: string) => {
    mutate(
      { teamId, action: 'decline' },
      {
        onSuccess: () => {
          toast({
            title: 'Rejected',
            description: 'Rejected Successfully',
          });
        },
      }
    );
  };

  if (error) {
    return (
      <Card className="border-red-200">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center text-center">
            <X className="mb-2 h-12 w-12 text-red-500" />
            <h3 className="text-lg font-semibold">
              Unable to Load Invitations
            </h3>
            <p className="text-muted-foreground">
              There was a problem loading your team invitations. Please try
              again later.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="container mx-auto py-8">
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-8 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </CardHeader>
              <CardContent>
                <div className="flex justify-end space-x-2">
                  <Skeleton className="h-10 w-24" />
                  <Skeleton className="h-10 w-24" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : invitations.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Inbox className="text-muted-foreground mb-4 h-16 w-16" />
            <h3 className="mb-2 text-xl font-semibold">No Team Invitations</h3>
            <p className="text-muted-foreground max-w-md text-center">
              You don't have any pending team invitations at this time. When
              someone invites you to join their team, it will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {invitations.map((invitation) => (
            <Card key={invitation.team_id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{invitation.nova_teams.name}</CardTitle>
                  <div className="text-muted-foreground flex items-center text-sm">
                    <Shield className="mr-1 h-4 w-4" />
                    <span>Join as team member</span>
                  </div>
                </div>
                <CardDescription>
                  {invitation.nova_teams.description}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="text-muted-foreground text-sm">
                    {t('teams.invited')}{' '}
                    {formatDistanceToNow(new Date(invitation.created_at), {
                      addSuffix: true,
                    })}
                  </div>
                  <div className="flex space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDecline(invitation.team_id)}
                      disabled={isPending}
                    >
                      <X className="mr-2 h-4 w-4" />
                      Decline
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleAccept(invitation.team_id)}
                      disabled={isPending}
                    >
                      <Check className="mr-2 h-4 w-4" />
                      Accept
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
