'use client';
import { FileText } from '@tuturuuu/icons';
import { showMeetingAiFailure } from '@tuturuuu/meet-core/features/meeting-ai/failure-toast';
import { useMeetingAi } from '@tuturuuu/meet-core/features/meeting-ai/use-meeting-ai';
import { Button, type ButtonProps } from '@tuturuuu/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import {
  type EndedNotesAvailability,
  endedNotesAvailability,
} from '../lib/ended-meeting-facts';
import { MeetingSessionNotes } from '../../meeting-ai/meeting-session-notes';
import { MeetingTranscript } from '../../meeting-ai/meeting-transcript';

export type EndedReader = Exclude<EndedNotesAvailability, 'loading' | 'none'>;

export function isEndedReader(
  value: EndedNotesAvailability
): value is EndedReader {
  return value === 'notes' || value === 'transcript' || value === 'both';
}

/**
 * The ended page's single read of the meet-ai state. It shares the notes
 * reader's query cache, so the button label and the reader never disagree.
 */
export function useEndedNotes(
  wsId: string,
  meetingId: string,
  canSeeNotes: boolean
) {
  const ai = useMeetingAi(wsId, meetingId, [], false, canSeeNotes);
  const availability: EndedNotesAvailability = canSeeNotes
    ? endedNotesAvailability({ data: ai.data, error: ai.error })
    : 'none';
  return { ai, availability };
}

const LABELS = {
  notes: { show: 'show_notes', hide: 'hide_notes' },
  transcript: { show: 'show_transcript', hide: 'hide_transcript' },
  both: { show: 'view_meeting_notes', hide: 'hide_meeting_notes' },
} as const satisfies Record<EndedReader, { show: string; hide: string }>;

export function EndedNotesToggle({
  reader,
  open,
  onToggle,
  disabled,
  primary,
  size,
}: {
  reader: EndedReader;
  open: boolean;
  onToggle: () => void;
  disabled?: boolean;
  primary: boolean;
  size?: ButtonProps['size'];
}) {
  const t = useTranslations('meet.call');
  return (
    <Button
      disabled={disabled}
      size={size ?? (primary ? 'lg' : 'sm')}
      variant={primary ? 'default' : 'ghost'}
      className={cn(primary && 'h-11 w-full rounded-full')}
      aria-expanded={open}
      onClick={onToggle}
    >
      <FileText className="size-4" />
      {t(LABELS[reader][open ? 'hide' : 'show'])}
    </Button>
  );
}

const HEADINGS = {
  notes: 'ended_reader_notes',
  transcript: 'ended_reader_transcript',
  both: 'ended_reader_both',
} as const satisfies Record<EndedReader, string>;

/**
 * Notes and transcript for a closed room. Tabs appear only when both exist;
 * one kind of content renders directly. `inline` drops the card so the
 * phone layout can place the reader inside the summary card.
 */
export function EndedNotesPanel({
  ai,
  reader,
  inline = false,
}: {
  ai: ReturnType<typeof useMeetingAi>;
  reader: EndedReader;
  inline?: boolean;
}) {
  const t = useTranslations('meet.call');
  const aiT = useTranslations('meet.ai');
  const headingId = useId();
  const data = ai.data;
  if (!data) return null;
  const retry =
    data.canManage && data.configured && data.available !== false
      ? data.sessions.filter(
          (session) => session.ended_at && session.notes_status !== 'completed'
        )
      : [];
  const notes = (
    <MeetingSessionNotes
      sessions={data.sessions}
      wsId={ai.wsId}
      meetingId={ai.meetingId}
      variant="ended"
    />
  );
  const transcript = (
    <MeetingTranscript
      chunks={data.chunks}
      heading={false}
      className="max-h-[min(36rem,60dvh)]"
    />
  );
  const body = (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <h2
          id={headingId}
          className={cn(
            'flex-1 font-semibold',
            inline ? 'text-base' : 'text-lg'
          )}
        >
          {t(HEADINGS[reader])}
        </h2>
        {retry.map((session) => (
          <Button
            key={session.id}
            size="sm"
            variant="outline"
            className="rounded-full"
            disabled={
              ai.busy ||
              (session.notes_status === 'processing' &&
                (!session.notes_started_at ||
                  Date.now() - Date.parse(session.notes_started_at) < 120_000))
            }
            onClick={() =>
              void ai
                .finish(session.id)
                .catch((error: unknown) => showMeetingAiFailure(aiT, error))
            }
          >
            {aiT('retry_notes')}
          </Button>
        ))}
      </div>
      {reader === 'both' ? (
        <Tabs defaultValue="notes" className="min-h-0 gap-4">
          <TabsList className="w-full">
            <TabsTrigger value="notes" className="flex-1">
              {t('ended_reader_notes')}
            </TabsTrigger>
            <TabsTrigger value="transcript" className="flex-1">
              {t('ended_reader_transcript')}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="notes">{notes}</TabsContent>
          <TabsContent value="transcript">{transcript}</TabsContent>
        </Tabs>
      ) : reader === 'notes' ? (
        notes
      ) : (
        transcript
      )}
    </>
  );
  if (inline)
    return (
      <section
        aria-labelledby={headingId}
        className="grid w-full gap-4 border-t pt-5 text-left"
      >
        {body}
      </section>
    );
  return (
    <section
      aria-labelledby={headingId}
      className="grid gap-4 rounded-3xl border bg-card p-5 text-card-foreground shadow-sm sm:p-6"
    >
      {body}
    </section>
  );
}
