import type { Session } from '@google/genai/web';
import { requireCurrentPrivateGrant } from './private-grant';
import { speakApprovedText } from './public-speech';
import { applyQuizArenaProposal } from './quiz-arena';
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
  if (review.name === 'propose_room_reply') approved = false;
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
    let result: Record<string, unknown> = {};
    if (approved && review.name === 'quiz_arena') {
      await requireCurrentPrivateGrant(env, saved);
      result = await applyQuizArenaProposal(
        env,
        saved.claims,
        saved.identity,
        review.args
      );
    }
    review.status = approved ? 'approved' : 'denied';
    response = { ...result, approved, completed: approved };
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
