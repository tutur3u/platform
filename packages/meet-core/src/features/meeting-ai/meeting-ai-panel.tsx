'use client';

import type { MeetAiSession } from '@tuturuuu/internal-api';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useTranslations } from 'next-intl';
import { TTR_URL } from '../../constants/common';
import { useRoomMiraConsent } from '../call/components/use-room-mira';
import { roomMiraFailureContext, showMeetingAiFailure } from './failure-toast';
import { MeetingAiStatusBar } from './meeting-ai-status-bar';
import { meetingAiStatus } from './meeting-ai-status';
import { MeetingLiveNotes } from './meeting-live-notes';
import { MeetingSessionNotes } from './meeting-session-notes';
import { MeetingTranscript } from './meeting-transcript';
import { readSelfRoom } from './self-room';
import type { useMeetingAi } from './use-meeting-ai';
import { useTranscriptConsent } from './use-transcript-consent';

/**
 * Transcript and notes for one meeting: a single status line with the next
 * action, the live transcript and the notes. In a call, starting records the
 * host's own Allow; capture waits for everyone else's.
 */
export function MeetingAiPanel({
  ai,
  inCall = false,
}: {
  ai: ReturnType<typeof useMeetingAi>;
  inCall?: boolean;
}) {
  const t = useTranslations('meet.ai');
  const { consent, choose, ensureAllowed, refresh } = useTranscriptConsent(
    ai.meetingId,
    inCall
  );
  const room = readSelfRoom(consent);
  // One opt-out never pauses the others in a per-speaker meeting, so the
  // room-wide fence does not describe it.
  const perSpeaker = inCall && room.mode === 'self';
  // The room's session and capture mode change with a start or a stop.
  // A Mira on given under the other notice is confirmed in the Mira notice
  // first; the room would refuse the host's Allow until then.
  const mira = useRoomMiraConsent(ai.meetingId, inCall);
  const run = (work: () => Promise<unknown>) =>
    void work().catch((error: unknown) =>
      showMeetingAiFailure(t, error, roomMiraFailureContext(mira.data))
    );
  const data = ai.data;
  const status = meetingAiStatus({
    isLoading: ai.isLoading,
    error: ai.error,
    data,
    phase: ai.phase,
    capturing: ai.capturing || (perSpeaker && !!room.session),
    creditFailure: ai.creditFailure,
    consent: inCall && !perSpeaker ? consent : undefined,
  });
  const canManage = !!data?.canManage;
  const active = data?.sessions.find(
    (session: MeetAiSession) => !session.ended_at
  );
  const miraStale =
    !!mira.data?.available &&
    mira.data.choice === 'on' &&
    !!mira.data.noticeStale;
  const start = async () => {
    if (inCall && !miraStale) await ensureAllowed();
    await ai.start();
    if (inCall) void refresh();
  };
  const finish = async (sessionId: string) => {
    await ai.finish(sessionId);
    if (inCall) void refresh();
  };
  const live = status.kind === 'live';
  return (
    <section className="flex min-h-0 flex-col gap-3 rounded-lg border bg-card p-4">
      <h2 className="font-semibold">{t('title')}</h2>
      <MeetingAiStatusBar
        status={status}
        canManage={canManage}
        inCall={inCall}
        busy={ai.busy || choose.isPending}
        creditFailure={ai.creditFailure}
        billingHref={`${TTR_URL}/${encodeURIComponent(ai.wsId)}/billing`}
        onStart={() => run(start)}
        onFinish={(sessionId) => run(() => finish(sessionId))}
        onRetryNotes={(sessionId) => run(() => ai.finish(sessionId))}
        onReload={() => void ai.refetch()}
        reloading={ai.isFetching}
      />
      {ai.recovering ? (
        <p role="status" className="rounded-lg bg-muted p-3 text-sm">
          {t('recovering', { count: ai.pendingChunks })}
        </p>
      ) : null}
      {active && ai.captureError && !ai.creditFailure ? (
        <p role="alert" className="text-destructive text-sm">
          {t('partial')}
        </p>
      ) : null}
      {data && status.kind !== 'blocked' ? (
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
            <MeetingTranscript
              chunks={data.chunks}
              heading={false}
              live={live}
              className="max-h-[min(28rem,55dvh)]"
            />
          </TabsContent>
          <TabsContent value="notes" className="space-y-3">
            {perSpeaker ? (
              <p className="text-muted-foreground text-sm">
                {t('self_notes_pickup')}
              </p>
            ) : null}
            {active && inCall ? (
              <MeetingLiveNotes
                wsId={ai.wsId}
                meetingId={ai.meetingId}
                sessionId={active.id}
                chunks={data.chunks}
                canManage={canManage}
              />
            ) : null}
            {!data.sessions.some((session: MeetAiSession) => session.notes) &&
            !(active && inCall) ? (
              <p className="py-4 text-muted-foreground text-sm">
                {t('notes_empty')}
              </p>
            ) : null}
            <MeetingSessionNotes
              sessions={data.sessions}
              wsId={ai.wsId}
              meetingId={ai.meetingId}
            />
          </TabsContent>
        </Tabs>
      ) : null}
      {inCall && status.kind !== 'blocked' && status.kind !== 'loading' ? (
        <div className="space-y-1 text-muted-foreground text-xs">
          {perSpeaker && <p>{t('self_body')}</p>}
          <p>{t(perSpeaker ? 'self_notice' : 'notice')}</p>
        </div>
      ) : null}
    </section>
  );
}
