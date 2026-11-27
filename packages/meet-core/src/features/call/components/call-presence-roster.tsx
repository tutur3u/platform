'use client';
import { CodeXml, FileText, Hand } from '@tuturuuu/icons';
import type { MeetRealtimePresence } from '@tuturuuu/realtime/meet';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { personInitials } from '../lib/person-initials';

const initials = (name: string) => personInitials(name);

/**
 * Presence-only rooms carry no media, so the stage highlights live activities
 * and shows who is here instead of empty video tiles, plus shortcuts into
 * shared work for people who can open it.
 */
export function CallPresenceRoster({
  participants,
  selfUserId,
  raisedHandUserIds,
  onProgramming,
  onDocument,
  liveActivities,
  activities,
}: {
  participants: readonly MeetRealtimePresence[];
  selfUserId: string | null;
  raisedHandUserIds: readonly string[];
  onProgramming?: () => void;
  onDocument?: () => void;
  liveActivities?: ReactNode;
  activities?: ReactNode;
}) {
  const t = useTranslations('meet.call');
  const programmingT = useTranslations('programmingPlayground');
  const collaborationT = useTranslations('meet.collaboration');
  const hasSecondaryActions = Boolean(
    onProgramming || onDocument || activities
  );

  return (
    <section
      aria-label={t('presence_roster.title', { count: participants.length })}
      className="flex h-full min-h-0 flex-col items-center overflow-y-auto rounded-2xl border bg-card px-4 py-6 sm:px-6 sm:py-8"
    >
      <div className="my-auto flex w-full max-w-3xl flex-col items-center gap-6">
        {liveActivities}
        <div className="flex w-full flex-col items-center gap-4">
          <p className="font-semibold text-muted-foreground text-sm">
            {t('presence_roster.title', { count: participants.length })}
          </p>
          <ul className="flex w-full max-w-3xl flex-wrap justify-center gap-x-5 gap-y-4">
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
        </div>
        {hasSecondaryActions && (
          <div
            data-testid="presence-secondary-activities"
            className={
              liveActivities
                ? 'flex w-full flex-col items-center gap-3 border-border/60 border-t pt-4'
                : 'flex flex-wrap items-center justify-center gap-2'
            }
          >
            {liveActivities && (
              <p className="font-medium text-muted-foreground text-xs">
                {t('presence_roster.more_activities')}
              </p>
            )}
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
          </div>
        )}
      </div>
    </section>
  );
}
