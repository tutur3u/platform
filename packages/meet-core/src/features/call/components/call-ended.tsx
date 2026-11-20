'use client';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, FileText, Loader2, PhoneOff } from '@tuturuuu/icons';
import { MeetingAiOverview } from '@tuturuuu/meet-core/features/meeting-ai/meeting-ai-overview';
import { NotesSharingControl } from '@tuturuuu/meet-core/features/meeting-ai/notes-sharing-control';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';
import { useEndedRoom } from '../hooks/use-ended-room';
import type { CallLifecycle } from '../lib/call-state';
import { EndedMeetingFactsRow } from './ended-meeting-facts-row';
import { EndedMeetingRating } from './ended-meeting-rating';
import { EndedMeetingSettings } from './ended-meeting-settings';
import { NewMeetingButton } from './new-meeting-button';
import { RestoreRoomButton } from './restore-room-button';

export function CallEnded({
  accountId,
  lifecycle = 'ended',
  initialShowNotes = false,
  canManage,
  canReadNotes,
  canStartMeeting = false,
  shareNotesAfterMeeting,
  wsId,
  meetingId,
  meetingName,
  backHref,
  saving = false,
  notes,
}: {
  accountId: string;
  /** `ended` when the room closed; any other value means this device left. */
  lifecycle?: CallLifecycle;
  initialShowNotes?: boolean;
  canManage: boolean;
  canReadNotes: boolean;
  /** Workspace members outside Parley may start another meeting from here. */
  canStartMeeting?: boolean;
  shareNotesAfterMeeting?: boolean;
  wsId: string;
  meetingId: string;
  meetingName: string;
  backHref: string;
  saving?: boolean;
  /** Replaces the default notes overview, e.g. with the meeting page reader. */
  notes?: ReactNode;
}) {
  const ended = lifecycle === 'ended';
  useEndedRoom(accountId, meetingId, ended);
  const queryClient = useQueryClient();
  const t = useTranslations('meet.call');
  const [showNotes, setShowNotes] = useState(initialShowNotes);
  const canSeeNotes = canManage || canReadNotes;
  const notesButton = (primary: boolean) => (
    <Button
      disabled={saving}
      size={primary ? 'lg' : 'sm'}
      variant={primary ? (showNotes ? 'secondary' : 'default') : 'ghost'}
      className={primary ? 'w-full' : undefined}
      aria-expanded={showNotes}
      onClick={() => setShowNotes(!showNotes)}
    >
      <FileText className="size-4" />
      {t(showNotes ? 'hide_meeting_notes' : 'view_meeting_notes')}
    </Button>
  );
  const backLink = (primary: boolean) => (
    <Button
      asChild
      size={primary ? 'lg' : 'sm'}
      variant={primary ? 'default' : 'ghost'}
      className={primary ? 'w-full' : undefined}
    >
      <Link
        href={backHref}
        onClick={() => {
          void queryClient.invalidateQueries({
            queryKey: ['meetings'],
            refetchType: 'all',
          });
          void queryClient.invalidateQueries({
            queryKey: ['meet-room-state', meetingId],
          });
        }}
      >
        <ArrowLeft className="size-4" />
        {t('back_to_meet')}
      </Link>
    </Button>
  );
  const rejoinable = !ended;
  const primary = rejoinable ? (
    <Button
      size="lg"
      className="w-full"
      onClick={() => window.location.reload()}
      disabled={saving}
    >
      {t('rejoin_call')}
    </Button>
  ) : canSeeNotes ? (
    notesButton(true)
  ) : (
    backLink(true)
  );
  return (
    <main
      className={cn(
        'flex min-h-dvh flex-col items-center gap-6 bg-background px-4 pt-8 pb-[max(2rem,env(safe-area-inset-bottom))]',
        !(showNotes && canSeeNotes) && 'justify-center'
      )}
    >
      <Card className="w-full max-w-md gap-5 rounded-2xl px-5 py-6 text-center sm:px-8 sm:py-8">
        <section className="grid gap-4" aria-labelledby="meet-ended-title">
          <div className="grid justify-items-center gap-2">
            <span className="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground">
              <PhoneOff aria-hidden="true" className="size-5" />
            </span>
            <p className="max-w-full break-words font-medium text-muted-foreground text-sm">
              {meetingName}
            </p>
            <h1
              id="meet-ended-title"
              className="text-balance font-semibold text-2xl tracking-tight"
            >
              {t(ended ? 'call_ended_title' : 'call_left_title')}
            </h1>
            <p className="text-pretty text-muted-foreground text-sm">
              {t(
                ended
                  ? canManage
                    ? 'ended_hint_host'
                    : canSeeNotes
                      ? 'ended_hint_reader'
                      : 'ended_hint'
                  : 'call_left_hint'
              )}
            </p>
            <EndedMeetingFactsRow
              wsId={wsId}
              meetingId={meetingId}
              canSeeNotes={canSeeNotes}
            />
          </div>
          {saving && (
            <p
              role="status"
              className="flex items-center justify-center gap-2 text-sm"
            >
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
              {t('saving_notes')}
            </p>
          )}
          <div className="grid justify-items-center gap-1">
            {primary}
            {(rejoinable || canSeeNotes) && backLink(false)}
          </div>
          <EndedMeetingRating accountId={accountId} meetingId={meetingId} />
        </section>
        <Accordion type="single" collapsible className="border-t">
          <AccordionItem value="actions" className="border-0">
            <AccordionTrigger className="justify-center gap-2 pt-3 pb-0 text-muted-foreground">
              {t('more_actions')}
            </AccordionTrigger>
            <AccordionContent className="space-y-3 pt-3 pb-0">
              <div className="flex flex-wrap items-center justify-center gap-1">
                {ended && canManage && (
                  <RestoreRoomButton
                    accountId={accountId}
                    meetingId={meetingId}
                    disabled={saving}
                    variant="ghost"
                    size="sm"
                  />
                )}
                {rejoinable && canSeeNotes && notesButton(false)}
                {canStartMeeting && (
                  <NewMeetingButton
                    wsId={wsId}
                    disabled={saving}
                    variant="ghost"
                  />
                )}
                <EndedMeetingSettings
                  wsId={wsId}
                  meetingId={meetingId}
                  canManage={canManage}
                  variant="ghost"
                  size="sm"
                />
              </div>
              {canManage && (
                <NotesSharingControl
                  wsId={wsId}
                  meetingId={meetingId}
                  initialEnabled={shareNotesAfterMeeting}
                />
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </Card>
      {showNotes && canSeeNotes && (
        <div className="w-full max-w-3xl">
          {notes ?? <MeetingAiOverview wsId={wsId} meetingId={meetingId} />}
        </div>
      )}
    </main>
  );
}
