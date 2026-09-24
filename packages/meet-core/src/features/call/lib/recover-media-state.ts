import type { MeetMediaState } from '@tuturuuu/realtime/meet';

/** Roll back failed publishing without reopening capture or overwriting newer intent. */
export function recoverMediaState(
  previous: MeetMediaState,
  next: MeetMediaState,
  current: MeetMediaState,
  microphoneEnabled: boolean
): MeetMediaState {
  const restored = { ...current };
  for (const key of ['audioEnabled', 'videoEnabled', 'screenEnabled'] as const)
    if (previous[key] !== next[key] && restored[key] === next[key])
      restored[key] = previous[key];
  restored.audioEnabled &&= next.audioEnabled && microphoneEnabled;
  return restored;
}
