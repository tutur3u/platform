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
import { Label } from '@tuturuuu/ui/label';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';
export function RoomHostControls({
  approved,
  onForget,
  shareNotes,
  onShareNotes,
}: {
  approved: MeetApprovedParticipant[];
  onForget: (userId: string) => void;
  shareNotes: boolean;
  onShareNotes: (enabled: boolean) => void;
}) {
  const t = useTranslations('meet.call');
  return (
    <section className="space-y-5 border-t p-4">
      <div>
        <h3 className="mb-3 font-semibold text-sm">{t('host_controls')}</h3>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <Label htmlFor="meet-share-notes">{t('share_notes')}</Label>
            <p className="text-muted-foreground text-xs">
              {t('share_notes_hint')}
            </p>
          </div>
          <Switch
            id="meet-share-notes"
            checked={shareNotes}
            onCheckedChange={onShareNotes}
          />
        </div>
      </div>
      <Accordion type="multiple">
        <AccordionItem value="approved" className="border-0">
          <AccordionTrigger className="gap-2 text-sm">
            <BadgeCheck className="size-4 shrink-0" />
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
                  <li key={person.userId} className="flex items-center gap-2">
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
                      className="size-8"
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
