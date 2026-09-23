import { liveRoomCommand } from './room';
import type { SavedSession } from './session-state';
import type { LiveEnvironment } from './storage';

export class LiveTranscriptPublisher {
  private queue = Promise.resolve();
  turn(env: LiveEnvironment, saved: SavedSession, role: string, text: string) {
    const next = this.queue.then(() =>
      publishLiveTranscript(env, saved, role, text)
    );
    this.queue = next.catch(() => {});
    return next;
  }
}

/** Private session turns never enter room history. */
export async function publishLiveTranscript(
  env: LiveEnvironment,
  saved: SavedSession,
  role: string,
  text: string
) {
  if (saved.claims.mode !== 'room' || role !== 'assistant' || !text.trim())
    return;
  const transcript = text.trim();
  for (let offset = 0; offset < transcript.length; ) {
    let end = Math.min(offset + 8000, transcript.length);
    // Keep a Unicode surrogate pair together at a chunk boundary.
    const last = transcript.charCodeAt(end - 1);
    if (end < transcript.length && last >= 0xd800 && last <= 0xdbff) end--;
    const command = {
      action: 'live.transcript',
      sessionId: saved.claims.sessionId,
      id: crypto.randomUUID(),
      text: transcript.slice(offset, end),
    };
    offset = end;
    if (!command.text.trim()) continue;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await liveRoomCommand(env, saved.claims, saved.identity, command);
        break;
      } catch (error) {
        if (attempt === 1) {
          console.warn('Could not publish Mira Live transcript', error);
          return;
        }
      }
    }
  }
}
