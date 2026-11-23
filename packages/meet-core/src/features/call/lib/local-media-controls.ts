import type { MeetMediaState } from '@tuturuuu/realtime/meet';
import type { Dispatch, SetStateAction } from 'react';
import {
  enhanceMicrophone,
  microphoneConstraints,
  NativeAudioProcessing,
} from './audio-processing';
import type { CameraEffects } from './camera-effects';
import { releaseCameraTracks } from './camera-release';
import { SCREEN_CAPTURE_OPTIONS } from './screen-capture';

type Ref<T> = { current: T };
type Setter<T> = Dispatch<SetStateAction<T>>;
/** Serialize microphone intent and device changes while keeping mute immediate. */
export function createLocalMediaControls({
  activeRef,
  canCapture = () => true,
  effects,
  localStreamRef,
  screenStreamRef,
  mediaRef,
  setLocalStream,
  setScreenStream,
  applyMedia,
}: {
  activeRef: Ref<boolean>;
  canCapture?: () => boolean;
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
  const audioProcessing = new NativeAudioProcessing(
    () => localStreamRef.current
  );
  let microphoneRevision = 0;
  let cameraRevision = 0;
  let requestedCamera: boolean | null = null;
  let requestedMicrophone: boolean | null = null;
  let audioQueue = Promise.resolve();
  let screenPending = false;
  const withAudio = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = audioQueue.then(operation);
    audioQueue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  };
  const selectDevice = async (kind: 'audio' | 'video', deviceId: string) => {
    if (!canCapture()) return;
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
          ? microphoneConstraints(audioProcessing.getPreferences())
          : {
              width: { ideal: 1280 },
              height: { ideal: 720 },
              frameRate: { ideal: 24 },
            }),
      },
    });
    if (kind === 'audio')
      await enhanceMicrophone(
        acquired.getAudioTracks?.()[0],
        audioProcessing.getPreferences()
      );
    // The camera may have been turned off while the device was opening.
    if (
      !activeRef.current ||
      !canCapture() ||
      (kind === 'video' && !mediaRef.current.videoEnabled)
    ) {
      for (const track of acquired.getTracks()) track.stop();
      if (kind === 'video') deviceIds.video = deviceId;
      return;
    }
    let committed = false;
    try {
      const source = acquired.getTracks()[0];
      const selected =
        kind === 'video' && source
          ? await effects.replaceSource(source)
          : source;
      if (
        !activeRef.current ||
        !canCapture() ||
        (kind === 'video' && !mediaRef.current.videoEnabled)
      ) {
        if (kind === 'video') {
          effects.dispose();
          deviceIds.video = deviceId;
        }
        for (const track of acquired.getTracks()) track.stop();
        return;
      }
      const enabledNow =
        kind === 'audio'
          ? (requestedMicrophone ?? mediaRef.current.audioEnabled)
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
  const requestMicrophone = (enabled: boolean) => {
    const revision = ++microphoneRevision;
    requestedMicrophone = enabled;
    // Cut capture immediately, even while a device acquisition is awaiting I/O.
    if (!enabled)
      for (const track of localStreamRef.current?.getAudioTracks() ?? [])
        track.enabled = false;
    return withAudio(async () => {
      try {
        if (
          !activeRef.current ||
          !canCapture() ||
          revision !== microphoneRevision
        )
          return;
        let stream = localStreamRef.current;
        if (
          enabled &&
          !stream?.getAudioTracks().some((track) => track.readyState === 'live')
        ) {
          const audio = await navigator.mediaDevices.getUserMedia({
            audio: microphoneConstraints(
              audioProcessing.getPreferences(),
              deviceIds.audio
            ),
          });
          await enhanceMicrophone(
            audio.getAudioTracks?.()[0],
            audioProcessing.getPreferences()
          );
          if (
            !activeRef.current ||
            !canCapture() ||
            revision !== microphoneRevision
          ) {
            for (const track of audio.getTracks()) track.stop();
            return;
          }
          stream = new MediaStream([
            ...(localStreamRef.current?.getVideoTracks() ?? []),
            ...audio.getAudioTracks(),
          ]);
          localStreamRef.current = stream;
          setLocalStream(stream);
        }
        for (const track of stream?.getAudioTracks() ?? [])
          track.enabled = enabled;
        await applyMedia(
          { ...mediaRef.current, audioEnabled: enabled },
          stream
        );
      } finally {
        if (revision === microphoneRevision) requestedMicrophone = null;
      }
    });
  };

  /**
   * Camera off releases the device instead of blanking frames. A newer toggle
   * (revision) always wins over this one's error recovery.
   */
  const turnCameraOff = async (revision: number) => {
    const stream = releaseCameraTracks(localStreamRef.current, effects);
    localStreamRef.current = stream;
    setLocalStream(stream);
    try {
      await applyMedia({ ...mediaRef.current, videoEnabled: false }, stream);
    } catch (error) {
      // A failed publish must not restore "camera on" without a capture.
      if (revision === cameraRevision && mediaRef.current.videoEnabled)
        await applyMedia(
          { ...mediaRef.current, videoEnabled: false },
          localStreamRef.current
        ).catch(() => undefined);
      throw error;
    }
  };

  /** Re-acquire the selected camera; a newer toggle discards this attempt. */
  const turnCameraOn = async (revision: number) => {
    const superseded = () =>
      !activeRef.current || !canCapture() || revision !== cameraRevision;
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
      if (superseded()) {
        for (const track of video.getTracks()) track.stop();
        return;
      }
      const source = video.getVideoTracks()[0];
      let processed: MediaStreamTrack | null;
      try {
        processed = source ? await effects.setSource(source) : null;
      } catch (error) {
        for (const track of video.getTracks()) track.stop();
        if (superseded()) return;
        if (error instanceof DOMException && error.name === 'AbortError')
          throw error;
        effects.dispose();
        throw error;
      }
      if (superseded()) {
        effects.dispose();
        for (const track of video.getTracks()) track.stop();
        return;
      }
      stream = new MediaStream([
        ...(localStreamRef.current?.getAudioTracks() ?? []),
        ...(processed ? [processed] : video.getVideoTracks()),
      ]);
      localStreamRef.current = stream;
      setLocalStream(stream);
    }
    effects.setEnabled(true);
    for (const track of stream.getVideoTracks()) track.enabled = true;
    await applyMedia({ ...mediaRef.current, videoEnabled: true }, stream);
  };

  const toggleCamera = async () => {
    if (!canCapture()) return;
    const revision = ++cameraRevision;
    // Toggling during a pending acquisition flips the requested state, so two
    // quick presses end with the camera off and nothing left capturing.
    const enable = !(requestedCamera ?? mediaRef.current.videoEnabled);
    requestedCamera = enable;
    try {
      if (enable) await turnCameraOn(revision);
      else await turnCameraOff(revision);
    } finally {
      if (revision === cameraRevision) requestedCamera = null;
    }
  };

  const toggleScreenShare = async () => {
    if (screenPending || !canCapture()) return;
    screenPending = true;
    try {
      if (mediaRef.current.screenEnabled) {
        await applyMedia(
          { ...mediaRef.current, screenEnabled: false },
          localStreamRef.current
        );
        for (const track of screenStreamRef.current?.getTracks() ?? []) {
          track.stop();
        }
        screenStreamRef.current = null;
        setScreenStream(null);
        return;
      }

      if (typeof navigator.mediaDevices?.getDisplayMedia !== 'function') {
        throw new DOMException(
          'Screen capture unavailable',
          'NotSupportedError'
        );
      }
      const display = await navigator.mediaDevices.getDisplayMedia(
        SCREEN_CAPTURE_OPTIONS
      );
      if (!display.getVideoTracks().length) {
        display.getTracks().forEach((track) => {
          track.stop();
        });
        throw new DOMException('No screen track', 'NotSupportedError');
      }
      if (!activeRef.current || !canCapture()) {
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
          void applyMedia(
            { ...mediaRef.current },
            localStreamRef.current
          ).catch(() => undefined);
        });
      try {
        await applyMedia(
          { ...mediaRef.current, screenEnabled: true },
          localStreamRef.current
        );
      } catch (error) {
        // Capture must not continue invisibly after publication fails.
        for (const track of display.getTracks()) track.stop();
        screenStreamRef.current = null;
        setScreenStream(null);
        // Restore rendered state and presence through the same media flow.
        await applyMedia(
          { ...mediaRef.current, screenEnabled: false },
          localStreamRef.current
        ).catch(() => undefined);
        throw error;
      }
    } finally {
      screenPending = false;
    }
  };

  return {
    toggleMicrophone: () =>
      requestMicrophone(
        !(requestedMicrophone ?? mediaRef.current.audioEnabled)
      ),
    muteMicrophone: () => requestMicrophone(false),
    unmuteMicrophone: () => requestMicrophone(true),
    cancelPendingMicrophone: () => {
      microphoneRevision++;
      requestedMicrophone = null;
    },
    toggleCamera,
    toggleScreenShare,
    selectDevice: (kind: 'audio' | 'video', deviceId: string) =>
      kind === 'audio'
        ? withAudio(() => selectDevice(kind, deviceId))
        : selectDevice(kind, deviceId),
    getSelectedDevices: () => ({ ...deviceIds, microphoneRevision }),
    getAudioProcessing: audioProcessing.getPreferences,
    getAudioProcessingSettings: audioProcessing.getSettings,
    setAudioProcessing: (
      next: Parameters<typeof audioProcessing.setPreferences>[0]
    ) => withAudio(() => audioProcessing.setPreferences(next)),
  };
}
