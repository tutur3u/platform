'use client';
import { CodeXml, FileText, Hand } from '@tuturuuu/icons';
import type { MeetRealtimePresence } from '@tuturuuu/realtime/meet';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters =
    parts.length > 1
      ? `${parts[0]![0]}${parts.at(-1)![0]}`
      : (parts[0]?.slice(0, 2) ?? '?');
  return letters.toLocaleUpperCase();
}

/**
 * Presence-only rooms carry no media, so the stage shows who is here instead
 * of empty video tiles, plus shortcuts into shared work for people who can
 * open it.
 */
export function CallPresenceRoster({
  participants,
  selfUserId,
  raisedHandUserIds,
  onProgramming,
  onDocument,
  activities,
}: {
  participants: readonly MeetRealtimePresence[];
  selfUserId: string | null;
  raisedHandUserIds: readonly string[];
  onProgramming?: () => void;
  onDocument?: () => void;
  activities?: ReactNode;
}) {
  const t = useTranslations('meet.call');
  const programmingT = useTranslations('programmingPlayground');
  const collaborationT = useTranslations('meet.collaboration');
  return (
    <section
      aria-label={t('presence_roster.title', { count: participants.length })}
      className="flex h-full min-h-0 flex-col items-center justify-center gap-6 overflow-y-auto rounded-2xl border bg-card px-4 py-8"
    >
      <p className="font-semibold text-muted-foreground text-sm">
        {t('presence_roster.title', { count: participants.length })}
      </p>
      <ul className="flex max-w-3xl flex-wrap justify-center gap-x-5 gap-y-4">
        {participants.map((person) => {
          const raised = raisedHandUserIds.includes(person.userId);
          const self = person.userId === selfUserId;
          return (
            <li
              key={person.userId}
              className="flex min-w-20 max-w-36 flex-col items-center gap-1.5 text-center"
            >
              <span className="relative">
                <Avatar className="size-14">
                  {person.avatarUrl && (
                    <AvatarImage src={person.avatarUrl} alt="" />
                  )}
                  <AvatarFallback className="font-semibold">
                    {initials(person.displayName)}
                  </AvatarFallback>
                </Avatar>
                {raised && (
                  <span
                    role="img"
                    aria-label={t('hand_raised')}
                    className="absolute -right-1 -bottom-1 grid size-6 place-items-center rounded-full border bg-background text-dynamic-orange"
                  >
                    <Hand className="size-3.5" />
                  </span>
                )}
              </span>
              <span
                className="line-clamp-2 w-full break-words text-sm"
                title={person.displayName}
              >
                {self
                  ? t('presence_roster.self', { name: person.displayName })
                  : person.displayName}
              </span>
            </li>
          );
        })}
      </ul>
      {(onProgramming || onDocument || activities) && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {onProgramming && (
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-full"
              onClick={onProgramming}
            >
              <CodeXml className="size-4" />
              {programmingT('coding')}
            </Button>
          )}
          {onDocument && (
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-full"
              onClick={onDocument}
            >
              <FileText className="size-4" />
              {collaborationT('document')}
            </Button>
          )}
          {activities}
        </div>
      )}
    </section>
  );
}
