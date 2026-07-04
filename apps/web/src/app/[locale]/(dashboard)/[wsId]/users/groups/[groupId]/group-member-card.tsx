'use client';

import {
  Cake,
  Ellipsis,
  Mail,
  Phone,
  User,
  UserCheck,
  VenusAndMars,
} from '@tuturuuu/icons';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Avatar, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@tuturuuu/ui/hover-card';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { RequireAttentionName } from '@/components/users/require-attention-name';
import type { useUserStatusLabels } from '@/hooks/use-user-status-labels';

export interface GroupMember extends WorkspaceUser {
  role?: string | null;
  isGuest?: boolean;
  phone?: string | null;
  gender?: string | null;
  birthday?: string | null;
  archived?: boolean;
  archived_until?: string | null;
  note?: string | null;
}

interface GroupMemberCardProps {
  person: GroupMember;
  wsId: string;
  canViewPersonalInfo: boolean;
  canUpdateUserGroups: boolean;
  userStatusLabels: ReturnType<typeof useUserStatusLabels>;
  onRemove: (person: GroupMember) => void;
}

export function GroupMemberCard({
  person,
  wsId,
  canViewPersonalInfo,
  canUpdateUserGroups,
  userStatusLabels,
  onRemove,
}: GroupMemberCardProps) {
  const t = useTranslations();
  const { dateTime } = useFormatter();

  const isManager = person.role === 'TEACHER';
  const isGuest = !!person.isGuest;
  const hasAvatar = Boolean(person.avatar_url);
  const isArchived =
    person.archived ||
    (person.archived_until && new Date(person.archived_until) > new Date());

  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <Link
          href={`/${wsId}/users/database/${person.id}`}
          className="group relative flex items-center gap-3 rounded-lg border border-border/50 bg-card/40 p-3 pr-11 transition-all duration-200 hover:border-border hover:bg-card/80 hover:shadow-sm"
        >
          {hasAvatar ? (
            <Avatar className="h-9 w-9 flex-shrink-0">
              <AvatarImage
                src={person.avatar_url as string}
                alt={person.display_name || person.full_name || t('avatar')}
              />
            </Avatar>
          ) : (
            <div
              className={cn(
                'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full',
                isManager ? 'bg-dynamic-green/10' : 'bg-dynamic-blue/10'
              )}
            >
              {isManager ? (
                <UserCheck className="h-4 w-4 text-dynamic-green" />
              ) : (
                <User className="h-4 w-4 text-dynamic-blue" />
              )}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <RequireAttentionName
                name={
                  person.full_name
                    ? person.display_name
                      ? `${person.full_name} (${person.display_name})`
                      : person.full_name
                    : person.display_name ||
                      person.email ||
                      (isManager
                        ? t('ws-user-group-details.managers')
                        : t('common.unknown'))
                }
                requireAttention={!!person.has_require_attention_feedback}
                className={cn(
                  'truncate font-medium text-sm',
                  isArchived &&
                    'text-dynamic-red line-through decoration-2 decoration-dynamic-red'
                )}
              />
              {isManager && (
                <Badge
                  variant="default"
                  className="border-dynamic-green/20 bg-dynamic-green/10 text-dynamic-green"
                >
                  {t('ws-user-group-details.managers')}
                </Badge>
              )}
              {isGuest && (
                <Badge
                  variant="secondary"
                  className="border-dynamic-orange/20 bg-dynamic-orange/10 text-dynamic-orange"
                >
                  {t('meet-together.guests')}
                </Badge>
              )}
            </div>
            {isArchived && (
              <div className="mt-1 font-semibold text-dynamic-red text-xs">
                {person.archived_until &&
                new Date(person.archived_until) > new Date() ? (
                  <>
                    {userStatusLabels.archived_until}:{' '}
                    {dateTime(new Date(person.archived_until))}
                  </>
                ) : (
                  userStatusLabels.archived
                )}
                {person.note && <div>{person.note}</div>}
              </div>
            )}
          </div>
          {canUpdateUserGroups && (
            <div className="absolute top-1/2 right-2 z-10 -translate-y-1/2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  >
                    <Ellipsis className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onRemove(person);
                    }}
                  >
                    {t('common.remove')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </Link>
      </HoverCardTrigger>
      <HoverCardContent align="end" className="w-80">
        <div className="space-y-2">
          {canViewPersonalInfo && (
            <>
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4" />
                <span className="sr-only">
                  {t('settings-account.phone-number')}
                </span>{' '}
                <span>
                  {person.phone || t('ws-user-group-attendance.phone_fallback')}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4" />
                <span className="sr-only">{t('ws-emails.singular')}</span>
                <span>{person.email || t('common.unknown')}</span>
              </div>
            </>
          )}
          <div className="flex items-center gap-2 text-sm">
            <VenusAndMars className="h-4 w-4" />
            <span className="sr-only">{t('common.gender')}</span>
            <span>{person.gender || t('common.unknown')}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Cake className="h-4 w-4" />
            <span className="sr-only">{t('common.birthday')}</span>
            <span>
              {person.birthday
                ? dateTime(new Date(person.birthday))
                : t('common.unknown')}
            </span>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
