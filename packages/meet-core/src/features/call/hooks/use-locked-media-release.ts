import type { MeetMediaState } from '@tuturuuu/realtime/meet';
import { useEffect } from 'react';
import type { CameraEffects } from '../lib/camera-effects';

type Ref<T> = { current: T };

/** Release locally captured devices as soon as the host locks their kind. */
export function useLockedMediaRelease({
  locks,
  effects,
  cancelPendingMicrophone,
  localStreamRef,
  mediaRef,
  applyMedia,
}: {
  locks: { audio: boolean; video: boolean; screen: boolean };
  effects: CameraEffects;
  cancelPendingMicrophone: () => void;
  localStreamRef: Ref<MediaStream | null>;
  mediaRef: Ref<MeetMediaState>;
  applyMedia: (
    media: MeetMediaState,
    stream: MediaStream | null
  ) => Promise<void>;
}) {
  useEffect(() => {
    if (locks.audio) {
      cancelPendingMicrophone();
      for (const track of localStreamRef.current?.getAudioTracks() ?? [])
        track.stop();
    }
    if (locks.video) {
      for (const track of localStreamRef.current?.getVideoTracks() ?? [])
        track.stop();
      effects.dispose();
    }
    if (locks.audio || locks.video || locks.screen)
      void applyMedia({ ...mediaRef.current }, localStreamRef.current).catch(
        () => undefined
      );
  }, [
    applyMedia,
    cancelPendingMicrophone,
    effects,
    localStreamRef,
    locks.audio,
    locks.video,
    locks.screen,
    mediaRef,
  ]);
}
