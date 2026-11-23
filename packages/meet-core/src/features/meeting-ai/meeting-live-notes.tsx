'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, RefreshCw, Sparkles } from '@tuturuuu/icons';
import {
  draftMeetAiNotes,
  type MeetAiChunk,
  type MeetAiDraft,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';

/**
 * Completed chunks between automatic drafts: about fifteen minutes of
 * speech, which keeps drafts plus the final notes inside the hourly notes
 * limit for one host and meeting.
 */
export const LIVE_NOTES_CHUNKS = 90;

const draftKey = (sessionId: string, bucket: number) => [
  'meet-ai-draft',
  sessionId,
  bucket,
];

/**
 * Live notes for the running session. A draft is generated automatically as
 * the transcript grows, or on request; drafts are not saved, and the final
 * notes replace them when the session stops.
 */
export function MeetingLiveNotes({
  wsId,
  meetingId,
  sessionId,
  chunks,
  canManage,
}: {
  wsId: string;
  meetingId: string;
  sessionId: string;
  chunks: MeetAiChunk[];
  canManage: boolean;
}) {
  const t = useTranslations('meet.ai');
  const queryClient = useQueryClient();
  const completed = chunks.filter(
    (chunk: MeetAiChunk) => chunk.status === 'completed'
  ).length;
  const bucket = Math.floor(completed / LIVE_NOTES_CHUNKS);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const draft = (signal?: AbortSignal) => {
    signal?.throwIfAborted();
    return draftMeetAiNotes(wsId, meetingId, { sessionId, timezone });
  };
  const automatic = useQuery({
    queryKey: draftKey(sessionId, bucket),
    queryFn: ({ signal }) => draft(signal),
    enabled: canManage && bucket > 0,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const manual = useMutation({
    mutationFn: () => draft(),
    onSuccess: (next: MeetAiDraft) =>
      queryClient.setQueryData(draftKey(sessionId, bucket), next),
  });
  const latest: MeetAiDraft | undefined =
    manual.data &&
    (!automatic.data ||
      manual.data.basedOnChunks >= automatic.data.basedOnChunks)
      ? manual.data
      : automatic.data;
  const notes = latest?.notes;
  const pending = manual.isPending || automatic.isFetching;
  const canUpdate =
    canManage && !pending && completed > (latest?.basedOnChunks ?? 0);
  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex flex-1 items-center gap-1.5 text-muted-foreground text-xs">
          {pending ? (
            <Loader2
              aria-hidden
              className="size-3.5 motion-safe:animate-spin"
            />
          ) : (
            <Sparkles aria-hidden className="size-3.5" />
          )}
          {pending
            ? t('live_notes_updating')
            : notes
              ? t('live_notes_draft')
              : t('live_notes_empty')}
        </p>
        {canManage && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!canUpdate}
            onClick={() => manual.mutate()}
          >
            <RefreshCw aria-hidden className="size-4" />
            {t('live_notes_update')}
          </Button>
        )}
      </div>
      {(manual.isError || automatic.isError) && !pending && (
        <p role="alert" className="text-muted-foreground text-xs">
          {t('live_notes_failed')}
        </p>
      )}
      {notes && (
        <div className="space-y-2 rounded-lg border border-dashed p-3">
          <p className="whitespace-pre-wrap">{notes.summary}</p>
          {(
            [
              ['decisions', notes.decisions],
              [
                'actions',
                notes.actionItems.map(
                  (item: { task: string; owner: string | null }) =>
                    `${item.task}${item.owner ? ` — ${item.owner}` : ''}`
                ),
              ],
              ['questions', notes.openQuestions],
            ] as const
          ).map(([key, items]) =>
            items.length ? (
              <div key={key} className="space-y-1">
                <h4 className="font-medium">
                  {key === 'decisions'
                    ? t('decisions')
                    : key === 'actions'
                      ? t('actions')
                      : t('questions')}
                </h4>
                <ul className="list-inside list-disc">
                  {items.map((item: string, index: number) => (
                    <li key={`${index}-${item}`}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null
          )}
        </div>
      )}
    </div>
  );
}
