import { removeLiveRegistry } from './registry-heartbeat';
import { liveRoomCommand } from './room';
import type { SavedSession } from './session-state';
import type { LiveEnvironment } from './storage';

/** Durable compensation also runs for initialized sessions that never connected. */
export async function cleanupEndedLiveSession(
  env: LiveEnvironment,
  saved: SavedSession,
  persist: () => Promise<void>,
  retry: () => Promise<void>
) {
  if (!saved.ended || (saved.registryRemoved && saved.roomReleased)) return;
  // Arm before I/O so process replacement cannot lose compensating work.
  await retry();
  if (!saved.registryRemoved) {
    try {
      await removeLiveRegistry(env, saved.claims);
      saved.registryRemoved = true;
      await persist();
    } catch {
      /* The durable alarm retries. */
    }
  }
  if (!saved.roomReleased) {
    try {
      if (saved.claims.mode === 'room')
        await liveRoomCommand(env, saved.claims, saved.identity, {
          action: 'live.stop',
          sessionId: saved.claims.sessionId,
        });
      saved.roomReleased = true;
      await persist();
    } catch {
      /* Independent cleanup still runs if registry removal fails. */
    }
  }
}
