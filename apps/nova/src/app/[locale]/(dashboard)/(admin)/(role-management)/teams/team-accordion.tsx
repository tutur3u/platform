'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
import { Mail, Users } from '@tuturuuu/ui/icons';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import moment from 'moment';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';

interface Member {
  id: string;
  team_id: string;
  created_at: string;
  display_name: string;
  email: string;
}

interface Invitation {
  id?: string;
  team_id: string;
  email: string;
  created_at: string;
}

export function TeamAccordion({ teamId }: { teamId: string }) {
  const t = useTranslations();
  const [isOpen, setIsOpen] = useState(false);

  const { data: members, isLoading: isLoadingMembers } = useQuery<Member[]>({
    queryKey: ['team', teamId, 'members'],
    queryFn: async () => {
      const res = await fetch(`/api/v1/nova/teams/${teamId}/members`);
      if (!res.ok) throw new Error('Failed to fetch members');
      const data = await res.json();
      return data.data as Member[];
    },
    enabled: isOpen, // Only fetch when accordion is open
  });

  const { data: invitations, isLoading: isLoadingInvitations } = useQuery<
    Invitation[]
  >({
    queryKey: ['team', teamId, 'invitations'],
    queryFn: async () => {
      const res = await fetch(`/api/v1/nova/teams/${teamId}/invitations`);
      if (!res.ok) throw new Error('Failed to fetch invitations');
      const data = await res.json();
      return data.data as Invitation[];
    },
    enabled: isOpen, // Only fetch when accordion is open
  });

  return (
    <Accordion
      type="single"
      collapsible
      className="w-full"
      onValueChange={(value) => {
        const isNowOpen = value === 'details';
        setIsOpen(isNowOpen);
      }}
    >
      <AccordionItem value="details" className="border-none">
        <AccordionTrigger
          className="flex items-center gap-2 rounded-md px-3 py-2 hover:bg-accent"
          onMouseDown={(e) => e.preventDefault()}
        >
          <span>{t('team-tabs.overview')}</span>
        </AccordionTrigger>
        <AccordionContent>
          <div className="space-y-4 py-2 pr-2 pl-4">
            {/* Members Section */}
            <div>
              <div className="mb-2 flex items-center gap-2">
                <Users className="h-4 w-4" />
                <h4 className="text-sm font-medium">{t('teams.members')}</h4>
              </div>

              {isLoadingMembers ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : members && members.length > 0 ? (
                <div className="max-h-40 space-y-2 overflow-y-auto">
                  {members.map((member) => (
                    <Link
                      href={`/profile/${member.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      key={member.id}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                    >
                      <Avatar className="h-6 w-6">
                        <AvatarImage src="" alt={member.display_name || ''} />
                        <AvatarFallback>
                          {member.display_name?.charAt(0) || '?'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 truncate">
                        <div className="font-medium">{member.display_name}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {member.email}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="py-1 text-sm text-muted-foreground">
                  {t('teams.no_members')}
                </div>
              )}
            </div>

            {/* Invitations Section */}
            <div>
              <div className="mb-2 flex items-center gap-2">
                <Mail className="h-4 w-4" />
                <h4 className="text-sm font-medium">
                  {t('teams.invitations')}
                </h4>
              </div>

              {isLoadingInvitations ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : invitations && invitations.length > 0 ? (
                <div className="max-h-40 space-y-2 overflow-y-auto">
                  {invitations.map((invitation) => (
                    <div
                      key={invitation.id || `invite-${invitation.email}`}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                    >
                      <Avatar className="h-6 w-6">
                        <AvatarFallback>
                          {invitation.email.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 truncate">
                        <div className="font-medium">{invitation.email}</div>
                        <div className="text-xs text-muted-foreground">
                          {t('teams.invited')}{' '}
                          {moment(invitation.created_at).format('MMM DD, YYYY')}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-1 text-sm text-muted-foreground">
                  {t('teams.no_invitations')}
                </div>
              )}
            </div>

            <Button size="sm" variant="secondary" asChild className="w-full">
              <a href={`/teams/${teamId}`}>{t('teams.manage')}</a>
            </Button>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
