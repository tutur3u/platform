import type { LiveAssistantEvent } from '../../src/features/live-assistant/contracts';
import { LiveAudioBatcher } from './audio-batcher';
import { liveRoomCommand } from './room';
import type { SavedSession } from './session-state';
import type { LiveEnvironment } from './storage';
export function createRoomLiveAudioBatcher(
  env: LiveEnvironment,
  saved: SavedSession,
  emit: (event: LiveAssistantEvent) => void,
  currentState: () => 'paused' | 'listening' | 'recovering'
) {
  let interrupted = false;
  return new LiveAudioBatcher(
    async (data, sequence, at, signal) => {
      await liveRoomCommand(
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
      );
      if (interrupted && !saved.ended && !signal?.aborted) {
        interrupted = false;
        emit({ type: 'state', state: currentState() });
      }
    },
    () => {
      interrupted = true;
      emit({
        type: 'state',
        state: 'recovering',
        detail: 'audio_delivery_interrupted',
      });
    }
  );
}
