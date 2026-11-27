import { EMPTY_LIVE_ACTIVITIES_SNAPSHOT } from '@tuturuuu/realtime/meet';
import { useEffect, useState } from 'react';
import { MeetToolProvider } from '../../src/features/call/tools/context';
import {
  closeLiveActivitiesRoom,
  liveActivitiesRoom,
} from '../../src/features/call/tools/live-activities/activities-store';
import { FlashcardsPanel } from '../../src/features/call/tools/live-activities/flashcards/flashcards-panel';
import { IcebreakerPanel } from '../../src/features/call/tools/live-activities/icebreaker/icebreaker-panel';

const MEETING_ID = 'fixture-meeting';
const SELF_ID = '00000000-0000-4000-8000-000000000099';

export function MiraDraftScene({ role }: { role: 'host' | 'guest' }) {
  const [ready, setReady] = useState(false);
  const isHost = role === 'host';

  useEffect(() => {
    closeLiveActivitiesRoom(MEETING_ID);
    const store = liveActivitiesRoom(MEETING_ID);
    store.setManager(isHost);
    let readRequestId: string | undefined;
    store.open((message) => {
      if (message.type === 'activity.read') {
        readRequestId = message.requestId;
      }
      return true;
    });
    store.receive({
      type: 'activity.snapshot',
      snapshot: EMPTY_LIVE_ACTIVITIES_SNAPSHOT,
      requestId: readRequestId,
    });
    setReady(true);
    return () => closeLiveActivitiesRoom(MEETING_ID);
  }, [isHost]);

  if (!ready) return null;

  return (
    <MeetToolProvider
      value={{
        meetingId: MEETING_ID,
        accountId: SELF_ID,
        requiresAccount: !isHost,
        canManage: isHost,
        canRunActivities: isHost,
        canDraftWithMira: isHost,
        enabled: true,
        selfUserId: SELF_ID,
        people: { [SELF_ID]: { displayName: 'Host' } },
        close: () => {},
      }}
    >
      <div className="grid min-h-screen grid-cols-1 gap-4 bg-background p-4 text-foreground md:grid-cols-2">
        <div
          data-testid="mira-flashcards-host"
          className="overflow-hidden rounded-2xl border bg-card"
        >
          <FlashcardsPanel meetingId={MEETING_ID} onClose={() => {}} />
        </div>
        <div
          data-testid="mira-icebreaker-host"
          className="overflow-hidden rounded-2xl border bg-card"
        >
          <IcebreakerPanel meetingId={MEETING_ID} onClose={() => {}} />
        </div>
      </div>
    </MeetToolProvider>
  );
}
