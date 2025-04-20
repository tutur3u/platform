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
import { Check, Inbox, Users, X } from '@tuturuuu/ui/icons';
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

  console.log('invitation:', invitations);

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
            description: 'Rejected Succesfully',
          });
        },
      }
    );
  };

  if (error) {
    return (
      <div className="p-4">
        <Card className="border-red-200">
          <CardContent className="pt-6">
            <p className="text-red-500">error</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="mb-2 text-3xl font-bold">{t('teams.invitations')}</h1>
        <p className="text-muted-foreground">Invitation Description hehe</p>
      </div>

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
          <CardContent className="flex flex-col items-center justify-center py-12 pt-6">
            <Inbox className="text-muted-foreground mb-4 h-12 w-12" />
            <p className="text-xl font-semibold">{t('teams.no_invitations')}</p>
            <p className="text-muted-foreground mt-2 max-w-md text-center">
              {/* {t('teams.no_invitations_desc')} */}
              No invitation
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
                    <Users className="mr-1 h-4 w-4" />
                    <span>mời bởi</span>
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
