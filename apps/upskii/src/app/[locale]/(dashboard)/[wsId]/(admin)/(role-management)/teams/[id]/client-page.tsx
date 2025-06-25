'use client';

import type { User as PlatformUser } from '@tuturuuu/types/primitives/User';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@tuturuuu/ui/alert-dialog';
import { Avatar, AvatarFallback } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@tuturuuu/ui/form';
import { useForm } from '@tuturuuu/ui/hooks/use-form';
import {
  Loader2,
  Mail,
  Trash,
  User,
  UserPlus,
  UsersRound,
} from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { toast } from '@tuturuuu/ui/sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { generateFunName, getInitials } from '@tuturuuu/utils/name-helper';
import moment from 'moment';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { z } from 'zod';

interface TeamData {
  id: string;
  name: string;
  created_at: string;
  [key: string]: unknown;
}

interface TeamDetailsClientProps {
  teamId: string;
  teamData: TeamData;
  initialMembers: PlatformUser[];
  initialInvitations: PlatformUser[];
}

export default function TeamDetailsClient({
  teamId,
  teamData,
  initialMembers = [],
  initialInvitations = [],
}: TeamDetailsClientProps) {
  const t = useTranslations();

  const [activeTab, setActiveTab] = useState('members');
  const [members, setMembers] = useState<PlatformUser[]>(initialMembers);
  const [invitations, setInvitations] =
    useState<PlatformUser[]>(initialInvitations);
  const [isInviteLoading, setIsInviteLoading] = useState(false);

  const emailFormSchema = z.object({
    email: z.string().email({
      message: t('validation.invalid_email'),
    }),
  });

  const emailForm = useForm({
    resolver: zodResolver(emailFormSchema),
    defaultValues: {
      email: '',
    },
  });

  const removeMember = async (userId: string) => {
    try {
      const res = await fetch(
        `/api/v1/nova/teams/${teamId}/members/${userId}`,
        {
          method: 'DELETE',
        }
      );

      if (res.ok) {
        setMembers(members.filter((member) => member.id !== userId));
        toast.success(t('teams.member_removed'));
      } else {
        const data = await res.json();
        toast.error(data.error || t('teams.failed_to_remove_member'));
      }
    } catch (error) {
      console.error(error);
      toast.error(t('teams.failed_to_remove_member'));
    }
  };

  const inviteByEmail = async (values: z.infer<typeof emailFormSchema>) => {
    try {
      setIsInviteLoading(true);

      // Check if this email is already invited
      if (invitations.some((inv) => inv.email === values.email)) {
        toast.error(t('teams.email_already_invited'));
        return;
      }

      const res = await fetch(`/api/v1/nova/teams/${teamId}/invitations`, {
        method: 'POST',
        body: JSON.stringify({
          email: values.email,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        // Add the new invitation to the list
        setInvitations([data.data, ...invitations]);
        emailForm.reset();
        toast.success(t('teams.invitation_sent'));
      } else {
        const data = await res.json();
        toast.error(data.error || t('teams.failed_to_invite'));
      }
    } catch (error) {
      console.error(error);
      toast.error(t('teams.failed_to_invite'));
    } finally {
      setIsInviteLoading(false);
    }
  };

  const removeInvitation = async (email: string) => {
    try {
      const res = await fetch(
        `/api/v1/nova/teams/${teamId}/invitations/${encodeURIComponent(email)}`,
        {
          method: 'DELETE',
        }
      );

      if (res.ok) {
        setInvitations(invitations.filter((inv) => inv.email !== email));
        toast.success(t('teams.invitation_removed'));
      } else {
        const data = await res.json();
        toast.error(data.error || t('teams.failed_to_remove_invitation'));
      }
    } catch (error) {
      console.error(error);
      toast.error(t('teams.failed_to_remove_invitation'));
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div className="space-y-1">
              <CardTitle className="text-2xl font-bold">
                {teamData.name}
              </CardTitle>
              <CardDescription>
                {t('teams.created')}{' '}
                {moment(teamData.created_at).format('MMMM DD, YYYY')}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg border p-3">
                  <div className="text-sm font-medium text-muted-foreground">
                    {t('common.members')}
                  </div>
                  <div className="flex items-center">
                    <UsersRound className="mr-2 h-4 w-4 text-muted-foreground" />
                    <span className="text-2xl font-bold">{members.length}</span>
                  </div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-sm font-medium text-muted-foreground">
                    {t('teams.invitations')}
                  </div>
                  <div className="flex items-center">
                    <Mail className="mr-2 h-4 w-4 text-muted-foreground" />
                    <span className="text-2xl font-bold">
                      {invitations.length}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('teams.add_member')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...emailForm}>
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  emailForm.handleSubmit(inviteByEmail)();
                }}
              >
                <FormField
                  control={emailForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <div className="relative">
                          <Mail className="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
                          <Input
                            {...field}
                            placeholder={t('teams.email')}
                            className="pl-8"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex flex-col space-y-2">
                  <Button
                    type="button"
                    onClick={() => {
                      const { email } = emailForm.getValues();
                      inviteByEmail({ email });
                    }}
                    disabled={isInviteLoading || !emailForm.formState.isValid}
                  >
                    {isInviteLoading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Mail className="mr-2 h-4 w-4" />
                    )}
                    {t('teams.send_invitation')}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>

      <Tabs
        defaultValue="members"
        value={activeTab}
        onValueChange={setActiveTab}
      >
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="members" className="flex gap-2">
            <User className="h-4 w-4" />
            {t('common.members')}
            <Badge variant="secondary" className="ml-1">
              {members.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="invitations" className="flex gap-2">
            <Mail className="h-4 w-4" />
            {t('teams.invitations')}
            <Badge variant="secondary" className="ml-1">
              {invitations.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="mt-4 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('teams.current_members')}</CardTitle>
              <CardDescription>
                {t('teams.members_count', { count: members.length })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {members.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <UserPlus className="h-12 w-12 text-muted-foreground" />
                  <p className="mt-4 text-muted-foreground">
                    {t('teams.no_members')}
                  </p>
                </div>
              ) : (
                <div className="divide-y rounded-md border">
                  {members.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between p-4"
                    >
                      <div className="flex items-center space-x-4">
                        <Avatar>
                          <AvatarFallback>
                            {getInitials(member.display_name || '')}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium">
                            {member.display_name}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {member.email}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">
                          {moment(member.created_at).format('MMM DD, YYYY')}
                        </Badge>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                            >
                              <Trash className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                {t('teams.remove_member')}
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                {t('teams.remove_member_confirmation', {
                                  name:
                                    member.display_name ||
                                    member.email ||
                                    generateFunName({
                                      id: member.id || '',
                                      locale: 'en',
                                    }),
                                })}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>
                                {t('common.cancel')}
                              </AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => removeMember(member.id || '')}
                              >
                                {t('common.remove')}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invitations" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('teams.current_invitations')}</CardTitle>
              <CardDescription>
                {t('teams.current_invitations_description')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {invitations.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Mail className="h-12 w-12 text-muted-foreground" />
                  <p className="mt-4 text-muted-foreground">
                    {t('teams.no_invitations')}
                  </p>
                </div>
              ) : (
                <div className="divide-y rounded-md border">
                  {invitations.map((invitation) => (
                    <div
                      key={invitation.email}
                      className="flex items-center justify-between p-4"
                    >
                      <div>
                        <div className="font-medium">{invitation.email}</div>
                        <div className="text-sm text-muted-foreground">
                          {t('teams.invited')}{' '}
                          {moment(invitation.created_at).format('MMM DD, YYYY')}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                            >
                              <Trash className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                {t('teams.remove_invitation')}
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                {t('teams.remove_invitation_description', {
                                  email: invitation.email || '',
                                })}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>
                                {t('common.cancel')}
                              </AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() =>
                                  removeInvitation(invitation.email || '')
                                }
                              >
                                {t('common.remove')}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
