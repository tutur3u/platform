import { liveRoomCommand } from './room';
import type { SavedSession } from './session-state';
import type { LiveEnvironment } from './storage';

/** Private session turns never enter room history. */
export async function publishLiveTranscript(
  env: LiveEnvironment,
  saved: SavedSession,
  role: string,
  text: string
) {
  if (saved.claims.mode !== 'room' || role !== 'assistant' || !text.trim())
    return;
  const command = {
    action: 'live.transcript',
    sessionId: saved.claims.sessionId,
    id: crypto.randomUUID(),
    text: text.trim().slice(0, 8000),
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await liveRoomCommand(env, saved.claims, saved.identity, command);
      return;
    } catch (error) {
      if (attempt === 1)
        console.warn('Could not publish Mira Live transcript', error);
    }
  }
}
