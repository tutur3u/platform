import type { MeetMediaState } from '@tuturuuu/realtime/meet';
import type { Dispatch, SetStateAction } from 'react';
import type { CameraEffects } from './camera-effects';

type Ref<T> = { current: T };
type Setter<T> = Dispatch<SetStateAction<T>>;
export function createLocalMediaControls({
  activeRef,
  effects,
  localStreamRef,
  screenStreamRef,
  mediaRef,
  setLocalStream,
  setScreenStream,
  applyMedia,
}: {
  activeRef: Ref<boolean>;
  effects: CameraEffects;
  localStreamRef: Ref<MediaStream | null>;
  screenStreamRef: Ref<MediaStream | null>;
  mediaRef: Ref<MeetMediaState>;
  setLocalStream: Setter<MediaStream | null>;
  setScreenStream: Setter<MediaStream | null>;
  applyMedia: (
    media: MeetMediaState,
    stream: MediaStream | null
  ) => Promise<void>;
}) {
  const toggleMicrophone = async () => {
    let stream = localStreamRef.current;
    if (
      !stream?.getAudioTracks().some((track) => track.readyState === 'live')
    ) {
      const audio = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      if (!activeRef.current) {
        audio.getTracks().forEach((track) => {
          track.stop();
        });
        return;
      }
      stream = new MediaStream([
        ...(localStreamRef.current?.getVideoTracks() ?? []),
        ...audio.getAudioTracks(),
      ]);
      localStreamRef.current = stream;
      setLocalStream(stream);
    }
    for (const track of stream.getAudioTracks()) {
      track.enabled = !mediaRef.current.audioEnabled;
    }
    await applyMedia(
      { ...mediaRef.current, audioEnabled: !mediaRef.current.audioEnabled },
      stream
    );
  };

  const toggleCamera = async () => {
    let stream = localStreamRef.current;
    if (
      !stream?.getVideoTracks().some((track) => track.readyState === 'live')
    ) {
      const video = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 24 },
        },
      });
      if (!activeRef.current) {
        video.getTracks().forEach((track) => {
          track.stop();
        });
        return;
      }
      const source = video.getVideoTracks()[0];
      let processed: MediaStreamTrack | null;
      try {
        processed = source ? await effects.setSource(source) : null;
      } catch (error) {
        effects.dispose();
        for (const track of video.getTracks()) track.stop();
        throw error;
      }
      if (!activeRef.current) {
        effects.dispose();
        return;
      }
      stream = new MediaStream([
        ...(localStreamRef.current?.getAudioTracks() ?? []),
        ...(processed ? [processed] : video.getVideoTracks()),
      ]);
      localStreamRef.current = stream;
      setLocalStream(stream);
    }
    effects.setEnabled(!mediaRef.current.videoEnabled);
    for (const track of stream.getVideoTracks()) {
      track.enabled = !mediaRef.current.videoEnabled;
    }
    await applyMedia(
      { ...mediaRef.current, videoEnabled: !mediaRef.current.videoEnabled },
      stream
    );
  };

  const toggleScreenShare = async () => {
    if (mediaRef.current.screenEnabled) {
      for (const track of screenStreamRef.current?.getTracks() ?? []) {
        track.stop();
      }
      screenStreamRef.current = null;
      setScreenStream(null);
      await applyMedia(
        { ...mediaRef.current, screenEnabled: false },
        localStreamRef.current
      );
      return;
    }

    const display = await navigator.mediaDevices
      .getDisplayMedia({
        video: true,
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'NotAllowedError')
          return null;
        throw error;
      });
    if (!display) return;
    if (!activeRef.current) {
      display.getTracks().forEach((track) => {
        track.stop();
      });
      return;
    }
    screenStreamRef.current = display;
    setScreenStream(display);
    // Ending the share from the browser's own bar must update the room too.
    display.getVideoTracks()[0]?.addEventListener('ended', () => {
      if (screenStreamRef.current !== display) return;
      screenStreamRef.current = null;
      setScreenStream(null);
      void applyMedia(
        { ...mediaRef.current, screenEnabled: false },
        localStreamRef.current
      ).catch(() => undefined);
    });
    await applyMedia(
      { ...mediaRef.current, screenEnabled: true },
      localStreamRef.current
    );
  };

  return { toggleMicrophone, toggleCamera, toggleScreenShare };
}
