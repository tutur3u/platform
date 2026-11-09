'use client';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, FileText, Loader2, PhoneOff } from '@tuturuuu/icons';
import { MeetingAiOverview } from '@tuturuuu/meet-core/features/meeting-ai/meeting-ai-overview';
import { NotesSharingControl } from '@tuturuuu/meet-core/features/meeting-ai/notes-sharing-control';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';
import { useEndedRoom } from '../hooks/use-ended-room';
import { EndedMeetingSettings } from './ended-meeting-settings';
import { RestoreRoomButton } from './restore-room-button';

export function CallEnded({
  accountId,
  ended = true,
  initialShowNotes = false,
  canManage,
  canReadNotes,
  shareNotesAfterMeeting,
  wsId,
  meetingId,
  meetingName,
  backHref,
  saving = false,
  notes,
}: {
  accountId: string;
  ended?: boolean;
  initialShowNotes?: boolean;
  canManage: boolean;
  canReadNotes: boolean;
  shareNotesAfterMeeting?: boolean;
  wsId: string;
  meetingId: string;
  meetingName: string;
  backHref: string;
  saving?: boolean;
  /** Replaces the default notes overview, e.g. with the meeting page reader. */
  notes?: ReactNode;
}) {
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
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-10">
      <div
        className={cn(
          'w-full space-y-8',
          showNotes && canSeeNotes ? 'max-w-2xl' : 'max-w-sm'
        )}
      >
        <section className="space-y-6 text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-full bg-muted">
            <PhoneOff className="size-5 text-muted-foreground" />
          </div>
          <div className="space-y-2">
            <p className="truncate font-medium text-muted-foreground text-sm">
              {meetingName}
            </p>
            <h1 className="text-balance font-semibold text-2xl tracking-tight">
              {t(ended ? 'call_ended_title' : 'call_left_title')}
            </h1>
            <p className="text-pretty text-muted-foreground text-sm">
              {t(ended ? 'ended_hint' : 'call_left_hint')}
            </p>
          </div>
          {saving && (
            <p
              role="status"
              className="flex items-center justify-center gap-2 text-sm"
            >
              <Loader2 className="size-4 animate-spin" />
              {t('saving_notes')}
            </p>
          )}
          <div className="space-y-2">
            {primary}
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
              <EndedMeetingSettings
                wsId={wsId}
                meetingId={meetingId}
                canManage={canManage}
                variant="ghost"
                size="sm"
              />
              {(rejoinable || canSeeNotes) && backLink(false)}
            </div>
          </div>
        </section>
        {canManage && (
          <div className="border-t pt-6">
            <NotesSharingControl
              variant="row"
              wsId={wsId}
              meetingId={meetingId}
              initialEnabled={shareNotesAfterMeeting}
            />
          </div>
        )}
        {showNotes &&
          canSeeNotes &&
          (notes ?? <MeetingAiOverview wsId={wsId} meetingId={meetingId} />)}
      </div>
    </main>
  );
}
