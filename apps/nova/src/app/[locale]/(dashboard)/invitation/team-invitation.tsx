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
import { enUS, vi } from 'date-fns/locale';
import { useLocale, useTranslations } from 'next-intl';

export const TeamInvitation = () => {
  const t = useTranslations('nova.invitation-page');
  const queryClient = useQueryClient();
  const locale = useLocale();

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
        title: t('error'),
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
            title: t('accept'),
            description: t('accepted-description'),
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
            title: t('decline'),
            description: t('declined-description'),
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
              {t('error-loading-title')}
            </h3>
            <p className="text-muted-foreground">
              {t('error-loading-description')}
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
            <h3 className="mb-2 text-xl font-semibold">
              {t('no-invitations')}
            </h3>
            <p className="text-muted-foreground max-w-md text-center">
              {t('no-invitations-description')}
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
                    <span>{t('join-as-team-member')}</span>
                  </div>
                </div>
                <CardDescription>
                  {invitation.nova_teams.description}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="text-muted-foreground text-sm">
                    {t('invited')}
                    {formatDistanceToNow(new Date(invitation.created_at), {
                      addSuffix: true,
                      locale: locale === 'vi' ? vi : enUS,
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
                      {t('decline')}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleAccept(invitation.team_id)}
                      disabled={isPending}
                    >
                      <Check className="mr-2 h-4 w-4" />
                      {t('accept')}
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
