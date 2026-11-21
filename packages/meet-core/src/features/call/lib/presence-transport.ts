import { useCallback, useEffect } from 'react';
import type { MeetMediaState } from '@tuturuuu/realtime/meet';
import { INITIAL_CALL_STATE, type CallState } from './call-state';
import type { CameraEffects } from './camera-effects';

export const IDLE_MEDIA: MeetMediaState = {
  audioEnabled: false,
  videoEnabled: false,
  screenEnabled: false,
};
export const INITIAL_PRESENCE_STATE: CallState = {
  ...INITIAL_CALL_STATE,
  settings: { shareNotes: false, transport: 'presence' },
};

type Ref<T> = { current: T };
export function usePresenceTransport(
  state: Ref<CallState>,
  transport: CallState['settings']['transport'],
  local: Ref<MediaStream | null>,
  screen: Ref<MediaStream | null>,
  media: Ref<MeetMediaState>,
  effects: CameraEffects,
  resetPublisher: () => void,
  resetSubscriber: () => void,
  setLocal: (stream: MediaStream | null) => void,
  setScreen: (stream: MediaStream | null) => void,
  setMedia: (next: MeetMediaState) => void,
  publishPresence: (next: MeetMediaState) => void
) {
  const allowed = useCallback(
    () => state.current.settings.transport !== 'presence',
    [state]
  );
  useEffect(() => {
    if (transport !== 'presence') return;
    resetPublisher();
    resetSubscriber();
    stopLocalCapture(effects, local, screen, setLocal, setScreen);
    media.current = IDLE_MEDIA;
    setMedia(media.current);
    publishPresence(media.current);
  }, [
    transport,
    resetPublisher,
    resetSubscriber,
    effects,
    local,
    screen,
    media,
    setLocal,
    setScreen,
    setMedia,
    publishPresence,
  ]);
  return allowed;
}

export function stopLocalCapture(
  effects: CameraEffects,
  local: Ref<MediaStream | null>,
  screen: Ref<MediaStream | null>,
  setLocal: (stream: MediaStream | null) => void,
  setScreen: (stream: MediaStream | null) => void
) {
  effects.dispose();
  for (const stream of [local.current, screen.current])
    for (const track of stream?.getTracks() ?? []) track.stop();
  local.current = screen.current = null;
  setLocal(null);
  setScreen(null);
}
