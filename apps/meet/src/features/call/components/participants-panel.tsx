'use client';
import {
  Check,
  Hand,
  MicOff,
  UserMinus,
  UserRoundPlus,
  Users,
  X,
} from '@tuturuuu/icons';
import type {
  MeetApprovedParticipant,
  MeetRealtimePresence,
  MeetRealtimeWaitingParticipant,
} from '@tuturuuu/realtime/meet';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { useTranslations } from 'next-intl';
import { RoomHostControls } from './room-host-controls';
export function ParticipantsPanel({
  approved,
  onForget,
  shareNotes,
  onShareNotes,
  canManage,
  onDecideAdmission,
  onMute,
  onRemove,
  participants,
  raisedHandUserIds,
  selfUserId,
  waiting,
}: {
  approved: MeetApprovedParticipant[];
  onForget: (userId: string) => void;
  shareNotes: boolean;
  onShareNotes: (enabled: boolean) => void;
  canManage: boolean;
  onDecideAdmission: (userId: string, admit: boolean) => void;
  onMute: (userId: string) => void;
  onRemove: (userId: string) => void;
  participants: MeetRealtimePresence[];
  raisedHandUserIds: string[];
  selfUserId: string | null;
  waiting: MeetRealtimeWaitingParticipant[];
}) {
  const t = useTranslations('meet.call');

  return (
    <ScrollArea className="min-h-0 flex-1">
      {canManage && waiting.length ? (
        <Accordion
          type="multiple"
          defaultValue={['requests']}
          className="border-b px-3"
        >
          <AccordionItem value="requests" className="border-0">
            <AccordionTrigger className="gap-2 text-sm">
              <UserRoundPlus className="size-4 shrink-0" />
              <span className="flex-1 text-left">{t('requests')}</span>
              <Badge variant="secondary">{waiting.length}</Badge>
            </AccordionTrigger>
            <AccordionContent>
              <ul className="space-y-2">
                {waiting.map((entry) => (
                  <li
                    className="grid grid-cols-[1.75rem_minmax(0,1fr)_2rem_2rem] items-center gap-2 rounded-lg border bg-muted/30 p-2"
                    key={entry.userId}
                  >
                    <Avatar className="size-7">
                      <AvatarImage src={entry.avatarUrl} alt="" />
                      <AvatarFallback>
                        {entry.displayName.slice(0, 1)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {entry.displayName}
                    </span>
                    <Button
                      aria-label={`${t('admit')}: ${entry.displayName}`}
                      className="size-8 shrink-0"
                      onClick={() => onDecideAdmission(entry.userId, true)}
                      size="icon"
                      type="button"
                    >
                      <Check className="size-4" />
                    </Button>
                    <Button
                      aria-label={`${t('deny')}: ${entry.displayName}`}
                      className="size-8 shrink-0"
                      onClick={() => onDecideAdmission(entry.userId, false)}
                      size="icon"
                      type="button"
                      variant="outline"
                    >
                      <X className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      ) : null}

      <div className="flex items-center gap-2 px-4 pt-4 pb-2 font-medium text-sm">
        <Users className="size-4" />
        <span className="flex-1">{t('in_call')}</span>
        <Badge variant="outline">{participants.length}</Badge>
      </div>
      <ul className="divide-y">
        {participants.map((participant) => {
          const isSelf = participant.userId === selfUserId;
          return (
            <li
              className="group flex items-center gap-2 px-4 py-2.5"
              key={participant.userId}
            >
              <Avatar className="size-8">
                <AvatarImage src={participant.avatarUrl} alt="" />
                <AvatarFallback>
                  {participant.displayName.slice(0, 1)}
                </AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1 truncate text-sm">
                {participant.displayName}
                {isSelf ? (
                  <span className="ml-1 text-muted-foreground">
                    ({t('you')})
                  </span>
                ) : null}
              </span>
              {raisedHandUserIds.includes(participant.userId) ? (
                <Hand className="size-3.5 shrink-0 text-dynamic-orange" />
              ) : null}
              {participant.media.audioEnabled ? null : (
                <span
                  title={t('microphone_muted')}
                  className="grid size-7 shrink-0 place-items-center text-muted-foreground"
                >
                  <MicOff aria-hidden="true" className="size-3.5" />
                  <span className="sr-only">{t('microphone_muted')}</span>
                </span>
              )}
              {canManage && !isSelf ? (
                <span className="flex gap-1">
                  {participant.media.audioEnabled ? (
                    <Button
                      aria-label={t('mute_participant', {
                        name: participant.displayName,
                      })}
                      className="size-7"
                      onClick={() => onMute(participant.userId)}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <MicOff className="size-3.5" />
                    </Button>
                  ) : null}
                  <Button
                    aria-label={t('remove_participant')}
                    className="size-7 text-dynamic-red"
                    onClick={() => onRemove(participant.userId)}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <UserMinus className="size-3.5" />
                  </Button>
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      {canManage && (
        <RoomHostControls
          approved={approved}
          onForget={onForget}
          shareNotes={shareNotes}
          onShareNotes={onShareNotes}
        />
      )}
    </ScrollArea>
  );
}
