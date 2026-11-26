'use client';

import { Users } from '@tuturuuu/icons';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { useTranslations } from 'next-intl';
import type { LobbyParticipant } from '../components/lobby-controls';
import { personInitial } from '../lib/person-initials';

const MAX_VISIBLE_AVATARS = 4;

/** Who is already inside, as one quiet line rather than a card. */
export function PrejoinParticipants({
  participants,
  connected,
  waiting,
}: {
  participants: readonly LobbyParticipant[];
  connected: boolean;
  waiting: boolean;
}) {
  const t = useTranslations('meet.call');
  if (waiting) return null;
  if (participants.length === 0)
    return connected ? (
      <p className="flex items-center gap-1.5 text-muted-foreground text-xs">
        <Users aria-hidden="true" className="size-4 shrink-0" />
        {t('lobby_nobody_here')}
      </p>
    ) : null;
  const visible = participants.slice(0, MAX_VISIBLE_AVATARS);
  const overflow = participants.length - visible.length;
  return (
    <div className="flex items-center gap-2 text-muted-foreground text-xs">
      <div className="flex shrink-0 -space-x-1.5">
        {visible.map((person) => (
          <Avatar
            className="size-6 ring-2 ring-background"
            key={person.userId}
            title={person.displayName}
          >
            <AvatarImage alt="" src={person.avatarUrl} />
            <AvatarFallback className="font-medium text-xs">
              {personInitial(person.displayName)}
            </AvatarFallback>
          </Avatar>
        ))}
      </div>
      <span className="min-w-0 truncate">
        {t('lobby_people_inside', { count: participants.length })}
        {overflow > 0 ? ` (+${overflow})` : ''}
      </span>
    </div>
  );
}
