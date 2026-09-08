'use client';
import { ArrowLeft, FileText, Loader2, PhoneOff } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { MeetingAiOverview } from '@/features/meeting-ai/meeting-ai-overview';
import { NotesSharingControl } from '@/features/meeting-ai/notes-sharing-control';

export function CallEnded({
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
}: {
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
}) {
  const t = useTranslations('meet.call');
  const [showNotes, setShowNotes] = useState(initialShowNotes);
  return (
    <main className="grid min-h-dvh place-items-center bg-muted/25 px-4 py-10">
      <div className="w-full max-w-2xl space-y-6">
        <section className="rounded-3xl border bg-card p-6 text-center shadow-sm sm:p-10">
          <div className="mx-auto mb-6 grid size-16 place-items-center rounded-2xl bg-muted">
            <PhoneOff className="size-7 text-muted-foreground" />
          </div>
          <p className="mb-2 truncate font-medium text-muted-foreground text-sm">
            {meetingName}
          </p>
          <h1 className="text-balance font-semibold text-3xl tracking-tight">
            {t(ended ? 'call_ended_title' : 'call_left_title')}
          </h1>
          <p className="mx-auto mt-3 max-w-md text-pretty text-muted-foreground text-sm">
            {t(ended ? 'ended_hint' : 'call_left_hint')}
          </p>
          {saving && (
            <p
              role="status"
              className="mt-4 flex items-center justify-center gap-2 text-sm"
            >
              <Loader2 className="size-4 animate-spin" />
              {t('saving_notes')}
            </p>
          )}
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            {!ended && (
              <Button
                onClick={() => window.location.reload()}
                disabled={saving}
              >
                {t('rejoin_call')}
              </Button>
            )}
            {(canManage || canReadNotes) && (
              <Button
                disabled={saving}
                variant={showNotes ? 'secondary' : 'default'}
                aria-expanded={showNotes}
                onClick={() => setShowNotes(!showNotes)}
              >
                <FileText className="size-4" />
                {t(showNotes ? 'hide_meeting_notes' : 'view_meeting_notes')}
              </Button>
            )}
            <Button asChild variant="outline">
              <Link href={backHref}>
                <ArrowLeft className="size-4" />
                {t('back_to_meet')}
              </Link>
            </Button>
          </div>
          {canManage && (
            <div className="mt-7">
              <NotesSharingControl
                wsId={wsId}
                meetingId={meetingId}
                initialEnabled={shareNotesAfterMeeting}
              />
            </div>
          )}
        </section>
        {showNotes && (canManage || canReadNotes) && (
          <MeetingAiOverview wsId={wsId} meetingId={meetingId} />
        )}
      </div>
    </main>
  );
}
