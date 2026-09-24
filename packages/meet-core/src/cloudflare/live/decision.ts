import type { Session } from '@google/genai/web';
import { speakApprovedText } from './public-speech';
import { approveLiveMemory, type LiveProposal } from './reviews';
import type { SavedSession } from './session-state';
import type { LiveEnvironment } from './storage';
import { queueLiveToolResponse } from './tool-responses';

export async function executeLiveDecision(
  saved: SavedSession,
  env: LiveEnvironment,
  review: LiveProposal,
  approved: boolean,
  signal: AbortSignal,
  provider: () => Session | undefined,
  persist: () => Promise<void>,
  retry: () => Promise<void>
) {
  let response: Record<string, unknown>;
  try {
    if (approved && review.name === 'remember')
      await approveLiveMemory(env, saved.claims, review);
    if (approved && review.name === 'propose_room_reply')
      await speakApprovedText(
        env,
        saved.claims,
        saved.identity,
        review.id,
        review.text,
        signal,
        async (billing, finalized) => {
          saved.publicBillings ??= {};
          if (finalized) delete saved.publicBillings[review.id];
          else saved.publicBillings[review.id] = billing;
          await persist();
          await retry();
        },
        saved.voice
      );
    review.status = approved ? 'approved' : 'denied';
    response = { approved, completed: approved };
  } catch {
    review.status = 'failed';
    response = {
      error:
        'Action failed or its outcome is uncertain. Do not claim success or retry without another request.',
    };
  }
  await queueLiveToolResponse(
    saved,
    provider(),
    { id: review.callId, name: review.name, response },
    persist
  );
}
