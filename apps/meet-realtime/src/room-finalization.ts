import {
  beginFinalizationAttempt,
  dueFinalizations,
  type MeetFinalizationState,
  settleFinalization,
} from '../../../packages/realtime/src/meet/finalization';
import { deliverMeetFinalization } from '../../../packages/realtime/src/meet/finalization-token';

/**
 * Deliver due transcription finalizations to Meet. Each attempt is persisted
 * before the request is sent, so a restart cannot grant extra attempts.
 */
export async function runRoomFinalizations<T extends MeetFinalizationState>(io: {
  read: () => T;
  write: (state: T) => Promise<void>;
  url: string | undefined;
  secret: string;
  now?: () => number;
  fetch?: typeof fetch;
}) {
  if (!io.url) return;
  const now = io.now ?? Date.now;
  for (const due of dueFinalizations(io.read(), now())) {
    const begun = beginFinalizationAttempt(io.read(), due.sessionId, now());
    await io.write(begun.state);
    if (!begun.record) continue;
    const outcome = await deliverMeetFinalization(begun.record, {
      url: io.url,
      secret: io.secret,
      now: now(),
      fetch: io.fetch,
    });
    await io.write(settleFinalization(io.read(), due.sessionId, outcome));
  }
}
