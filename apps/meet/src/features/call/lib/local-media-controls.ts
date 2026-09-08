import type { MeetMediaState } from '@tuturuuu/realtime/meet';
import type { Dispatch, SetStateAction } from 'react';
import type { CameraEffects } from './camera-effects';
import { SCREEN_CAPTURE_OPTIONS } from './screen-capture';

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
  const deviceIds = { audio: '', video: '' };
  const selectDevice = async (kind: 'audio' | 'video', deviceId: string) => {
    const old = localStreamRef.current;
    const enabled =
      kind === 'audio'
        ? mediaRef.current.audioEnabled
        : mediaRef.current.videoEnabled;
    if (!enabled) {
      deviceIds[kind] = deviceId;
      if (kind === 'video') effects.dispose();
      for (const track of old
        ?.getTracks()
        .filter((track) => track.kind === kind) ?? []) {
        old?.removeTrack(track);
        track.stop();
      }
      return;
    }
    const acquired = await navigator.mediaDevices.getUserMedia({
      [kind]: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        ...(kind === 'audio'
          ? {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            }
          : {
              width: { ideal: 1280 },
              height: { ideal: 720 },
              frameRate: { ideal: 24 },
            }),
      },
    });
    if (!activeRef.current) {
      for (const track of acquired.getTracks()) track.stop();
      return;
    }
    let committed = false;
    try {
      const source = acquired.getTracks()[0];
      const selected =
        kind === 'video' && source
          ? await effects.replaceSource(source)
          : source;
      if (!activeRef.current) {
        if (kind === 'video') effects.dispose();
        for (const track of acquired.getTracks()) track.stop();
        return;
      }
      const enabledNow =
        kind === 'audio'
          ? mediaRef.current.audioEnabled
          : mediaRef.current.videoEnabled;
      if (selected) selected.enabled = enabledNow;
      if (kind === 'video') effects.setEnabled(enabledNow);
      const current = localStreamRef.current;
      const next = new MediaStream([
        ...(current?.getTracks().filter((track) => track.kind !== kind) ?? []),
        ...(selected ? [selected] : []),
      ]);
      localStreamRef.current = next;
      setLocalStream(next);
      committed = true;
      deviceIds[kind] = deviceId;
      for (const track of current
        ?.getTracks()
        .filter((track) => track.kind === kind) ?? [])
        track.stop();
      await applyMedia({ ...mediaRef.current }, next);
    } catch (error) {
      // Keep an installed source alive so transport recovery can republish it.
      if (!committed) for (const track of acquired.getTracks()) track.stop();
      throw error;
    }
  };
  const toggleMicrophone = async () => {
    let stream = localStreamRef.current;
    if (
      !stream?.getAudioTracks().some((track) => track.readyState === 'live')
    ) {
      const audio = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: deviceIds.audio ? { exact: deviceIds.audio } : undefined,
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
          deviceId: deviceIds.video ? { exact: deviceIds.video } : undefined,
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
        if (error instanceof DOMException && error.name === 'AbortError')
          throw error;
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
      .getDisplayMedia(SCREEN_CAPTURE_OPTIONS)
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
      for (const track of display.getTracks()) track.stop();
      screenStreamRef.current = null;
      setScreenStream(null);
      void applyMedia(
        { ...mediaRef.current, screenEnabled: false },
        localStreamRef.current
      ).catch(() => undefined);
    });
    for (const track of display.getAudioTracks())
      track.addEventListener('ended', () => {
        if (
          screenStreamRef.current !== display ||
          !mediaRef.current.screenEnabled
        )
          return;
        void applyMedia({ ...mediaRef.current }, localStreamRef.current).catch(
          () => undefined
        );
      });
    await applyMedia(
      { ...mediaRef.current, screenEnabled: true },
      localStreamRef.current
    );
  };

  return {
    toggleMicrophone,
    toggleCamera,
    toggleScreenShare,
    selectDevice,
    getSelectedDevices: () => ({ ...deviceIds }),
  };
}
