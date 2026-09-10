import type { LiveAssistantEvent } from '../../src/features/live-assistant/contracts';
import { LiveAudioBatcher } from './audio-batcher';
import { liveRoomCommand } from './room';
import type { SavedSession } from './session-state';
import type { LiveEnvironment } from './storage';
export function createRoomLiveAudioBatcher(
  env: LiveEnvironment,
  saved: SavedSession,
  emit: (event: LiveAssistantEvent) => void
) {
  return new LiveAudioBatcher(
    (data, sequence, at, signal) =>
      liveRoomCommand(
        env,
        saved.claims,
        saved.identity,
        {
          action: 'live.audio',
          sessionId: saved.claims.sessionId,
          data,
          sequence,
          at,
        },
        signal
      ),
    () =>
      emit({
        type: 'state',
        state: 'recovering',
        detail: 'audio_delivery_interrupted',
      })
  );
}
