'use client';

import { Button } from '@tuturuuu/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useTranslations } from 'next-intl';
import { showMeetingAiFailure } from './failure-toast';
import { MeetingAiUnavailable } from './meeting-ai-unavailable';
import { MeetingSessionNotes } from './meeting-session-notes';
import { MeetingTranscript } from './meeting-transcript';
import type { MeetAiSession } from '@tuturuuu/internal-api';
import type { useMeetingAi } from './use-meeting-ai';

export function MeetingAiPanel({
  ai,
  inCall = false,
}: {
  ai: ReturnType<typeof useMeetingAi>;
  inCall?: boolean;
}) {
  const t = useTranslations('meet.ai');
  const run = (work: () => Promise<unknown>) =>
    void work().catch((error: unknown) => showMeetingAiFailure(t, error));
  const data = ai.data;
  const active = data?.sessions.find(
    (session: MeetAiSession) => !session.ended_at
  );
  return (
    <section className="flex min-h-0 flex-col gap-3 rounded-lg border bg-card p-4">
      <h2 className="font-semibold">{t('title')}</h2>
      {ai.isLoading ? <p role="status">{t('loading')}</p> : null}
      {ai.error ? (
        <MeetingAiUnavailable
          block={{ kind: 'load_failed' }}
          onRetry={() => void ai.refetch()}
          retrying={ai.isFetching}
        />
      ) : null}
      {data ? (
        <>
          {data.available === false ? null : (
            <p className="text-muted-foreground text-xs">
              {t(inCall ? 'notice' : 'review_notice')}
            </p>
          )}
          {data.available === false ? (
            <MeetingAiUnavailable
              block={{
                kind: 'off',
                reason: data.unavailableReason ?? 'disabled',
              }}
              onRetry={() => void ai.refetch()}
              retrying={ai.isFetching}
            />
          ) : !data.configured ? (
            <MeetingAiUnavailable block={{ kind: 'not_configured' }} />
          ) : null}
          {active ? (
            <p role="status" className="font-medium text-sm">
              {t(ai.capturing ? 'capturing' : 'active')}
            </p>
          ) : null}
          {ai.recovering ? (
            <p role="status" className="rounded-lg border bg-muted p-3 text-sm">
              {t('recovering', { count: ai.pendingChunks })}
            </p>
          ) : null}
          {ai.creditFailure ? (
            <p role="alert" className="text-destructive text-sm">
              {t('credits_stopped')} {t(ai.creditFailure)}
            </p>
          ) : active && ai.captureError ? (
            <p role="alert" className="text-destructive text-sm">
              {t('partial')}
            </p>
          ) : null}
          {ai.busy ? <p role="status">{t('processing')}</p> : null}
          {data.canManage && data.configured && data.available !== false ? (
            <div className="flex flex-wrap gap-2">
              {inCall && !active ? (
                <Button disabled={ai.busy} onClick={() => run(ai.start)}>
                  {t('start')}
                </Button>
              ) : null}
              {active ? (
                <Button
                  disabled={ai.busy}
                  variant="secondary"
                  onClick={() => run(() => ai.finish(active.id))}
                >
                  {t('finish')}
                </Button>
              ) : null}
              {data.sessions
                .filter(
                  (session: MeetAiSession) =>
                    session.ended_at && session.notes_status !== 'completed'
                )
                .map((session: MeetAiSession) => (
                  <Button
                    key={session.id}
                    disabled={
                      ai.busy ||
                      (session.notes_status === 'processing' &&
                        (!session.notes_started_at ||
                          Date.now() - Date.parse(session.notes_started_at) <
                            120_000))
                    }
                    variant="secondary"
                    onClick={() => run(() => ai.finish(session.id))}
                  >
                    {t('retry_notes')}
                  </Button>
                ))}
            </div>
          ) : null}
          <Tabs
            defaultValue={inCall ? 'transcript' : 'notes'}
            className="min-h-0"
          >
            <TabsList className="w-full">
              <TabsTrigger value="transcript" className="flex-1">
                {t('transcript')}
              </TabsTrigger>
              <TabsTrigger value="notes" className="flex-1">
                {t('notes')}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="transcript">
              <MeetingTranscript chunks={data.chunks} />
            </TabsContent>
            <TabsContent value="notes">
              {!data.sessions.some(
                (session: MeetAiSession) => session.notes
              ) && (
                <p className="py-4 text-muted-foreground text-sm">
                  {t('notes_empty')}
                </p>
              )}
              <MeetingSessionNotes
                sessions={data.sessions}
                wsId={ai.wsId}
                meetingId={ai.meetingId}
              />
            </TabsContent>
          </Tabs>
        </>
      ) : null}
    </section>
  );
}
