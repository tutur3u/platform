'use client';
import { BadgeCheck, UserMinus } from '@tuturuuu/icons';
import type { MeetApprovedParticipant } from '@tuturuuu/realtime/meet';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
/**
 * Host-only list of people admitted before, who skip the lobby next time.
 * Who may read the transcript and notes lives in Meet settings.
 */
export function RoomHostControls({
  approved,
  onForget,
}: {
  approved: MeetApprovedParticipant[];
  onForget: (userId: string) => void;
}) {
  const t = useTranslations('meet.call');
  return (
    <section aria-label={t('host_controls')} className="border-t px-4">
      <Accordion type="multiple">
        <AccordionItem value="approved" className="border-0">
          <AccordionTrigger className="gap-2 text-sm">
            <span aria-hidden="true" className="shrink-0">
              <BadgeCheck className="size-4" />
            </span>
            <span className="flex-1 text-left">{t('approved_people')}</span>
            <Badge variant="secondary">{approved.length}</Badge>
          </AccordionTrigger>
          <AccordionContent>
            <p className="mt-1 text-muted-foreground text-xs">
              {t('approved_people_hint')}
            </p>
            {approved.length ? (
              <ul className="mt-3 space-y-2">
                {approved.map((person) => (
                  <li
                    key={person.userId}
                    className="flex min-h-11 items-center gap-3"
                  >
                    <Avatar className="size-7">
                      <AvatarImage src={person.avatarUrl} alt="" />
                      <AvatarFallback>
                        {person.displayName.slice(0, 1)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {person.displayName}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 shrink-0 pointer-coarse:size-11"
                      aria-label={`${t('forget_approval')}: ${person.displayName}`}
                      title={t('forget_approval')}
                      onClick={() => onForget(person.userId)}
                    >
                      <UserMinus className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-muted-foreground text-xs">
                {t('approved_empty')}
              </p>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </section>
  );
}
