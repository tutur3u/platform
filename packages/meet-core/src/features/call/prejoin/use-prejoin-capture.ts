'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  filterDevicesByKind,
  stopMediaStream,
  useLobbyMediaDevices,
} from '../lib/lobby-media';

/**
 * getUserMedia rejections meaning the requested device id no longer exists
 * (unplugged, or a stale id from a previous session), not a permission block.
 */
function isMissingDeviceError(error: unknown): boolean {
  const name = (error as { name?: unknown } | null)?.name;
  return name === 'OverconstrainedError' || name === 'NotFoundError';
}

/**
 * A selected id the browser no longer lists. Only trust the list once it has
 * labels for that kind (permission granted); before that ids may be hidden.
 */
function isUnlistedDevice(
  devices: readonly MediaDeviceInfo[],
  kind: MediaDeviceKind,
  deviceId: string
): boolean {
  if (!deviceId) return false;
  if (!devices.some((device) => device.kind === kind && device.label))
    return false;
  return !filterDevicesByKind(devices, kind).some(
    (device) => device.deviceId === deviceId
  );
}

/** Call `onEnded` when any track of `stream` ends (device unplugged/revoked). */
function watchTracksEnded(stream: MediaStream, onEnded: () => void) {
  const tracks = stream.getTracks?.() ?? [];
  for (const track of tracks) track.addEventListener?.('ended', onEnded);
  return () => {
    for (const track of tracks) track.removeEventListener?.('ended', onEnded);
  };
}

function canCapture() {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function'
  );
}

/**
 * `blocked`: a viewer or a presence-only room, which never captures.
 * `pending`: the room has not reported a role yet; the preview keeps running
 * but Join hands nothing to the room until the role is known.
 */
export type PrejoinLimit = 'none' | 'pending' | 'blocked';

export type PrejoinJoinMedia = {
  previewStream: MediaStream | null;
  audioEnabled: boolean;
  videoEnabled: boolean;
  audioDeviceId: string;
  videoDeviceId: string;
  outputDeviceId: string;
};

/**
 * The local pre-join preview: microphone and camera streams, device choice and
 * the mute and camera switches. Nothing is published until the stage hands the
 * preview to the room, so the stream stays on this device.
 */
export function usePrejoinCapture() {
  const t = useTranslations('meet.call');
  const { devices, refreshDevices } = useLobbyMediaDevices();
  const [audioRequested, setAudioRequested] = useState(true);
  const [videoRequested, setVideoRequested] = useState(false);
  const [limit, setLimit] = useState<PrejoinLimit>('none');
  const [handedOff, setHandedOff] = useState(false);
  const [audioDeviceId, setAudioDeviceId] = useState('');
  const [videoDeviceId, setVideoDeviceId] = useState('');
  const [outputDeviceId, setOutputDeviceId] = useState('');
  // Bumped to re-acquire the system default after its track ended.
  const [micAttempt, setMicAttempt] = useState(0);
  const [cameraAttempt, setCameraAttempt] = useState(0);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const transferred = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);

  const blocked = limit === 'blocked';
  const audioEnabled = !blocked && audioRequested;
  const videoEnabled = !blocked && videoRequested;
  const cameraBlockedMessage = t('camera_blocked');
  const micBlockedMessage = t('lobby_mic_blocked');

  useEffect(() => {
    if (!videoEnabled || handedOff || !canCapture()) return;
    let cancelled = false;
    let acquired: MediaStream | null = null;
    let unwatch: (() => void) | undefined;
    const videoConstraint = videoDeviceId
      ? {
          deviceId: { exact: videoDeviceId },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 24 },
        }
      : true;
    navigator.mediaDevices
      .getUserMedia({ video: videoConstraint })
      .then((next) => {
        acquired = next;
        if (cancelled) {
          stopMediaStream(next);
          return;
        }
        setPreviewError(null);
        setStream(next);
        unwatch = watchTracksEnded(next, () => {
          if (cancelled || transferred.current === next) return;
          setStream(null);
          if (videoDeviceId) setVideoDeviceId('');
          else setCameraAttempt((attempt) => attempt + 1);
          void refreshDevices();
        });
        void refreshDevices();
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        if (videoDeviceId && isMissingDeviceError(cause)) {
          // Stale or unplugged camera: retry with the system default.
          setVideoDeviceId('');
          void refreshDevices();
          return;
        }
        setPreviewError(cameraBlockedMessage);
        setVideoRequested(false);
      });
    return () => {
      cancelled = true;
      unwatch?.();
      if (transferred.current !== acquired) stopMediaStream(acquired);
    };
  }, [
    cameraAttempt,
    cameraBlockedMessage,
    handedOff,
    refreshDevices,
    videoDeviceId,
    videoEnabled,
  ]);

  useEffect(() => {
    if (!audioEnabled || handedOff || !canCapture()) return;
    let cancelled = false;
    let acquired: MediaStream | null = null;
    let unwatch: (() => void) | undefined;
    navigator.mediaDevices
      .getUserMedia({
        audio: audioDeviceId ? { deviceId: { exact: audioDeviceId } } : true,
      })
      .then((next) => {
        acquired = next;
        if (cancelled) {
          stopMediaStream(next);
          return;
        }
        setMicError(null);
        micStreamRef.current = next;
        setMicStream(next);
        unwatch = watchTracksEnded(next, () => {
          if (cancelled || micStreamRef.current !== next) return;
          if (audioDeviceId) setAudioDeviceId('');
          else setMicAttempt((attempt) => attempt + 1);
          void refreshDevices();
        });
        void refreshDevices();
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        if (audioDeviceId && isMissingDeviceError(cause)) {
          // Stale or unplugged microphone: retry with the system default.
          setAudioDeviceId('');
          void refreshDevices();
          return;
        }
        setMicError(micBlockedMessage);
        setAudioRequested(false);
      });
    return () => {
      cancelled = true;
      unwatch?.();
      stopMediaStream(acquired);
      if (micStreamRef.current === acquired) micStreamRef.current = null;
      setMicStream((current) => (current === acquired ? null : current));
    };
  }, [
    audioDeviceId,
    audioEnabled,
    handedOff,
    micAttempt,
    micBlockedMessage,
    refreshDevices,
  ]);

  // Once the browser lists labelled devices, drop selections it no longer has
  // so the pickers and the capture agree.
  useEffect(() => {
    if (isUnlistedDevice(devices, 'audioinput', audioDeviceId))
      setAudioDeviceId('');
    if (isUnlistedDevice(devices, 'videoinput', videoDeviceId))
      setVideoDeviceId('');
    if (isUnlistedDevice(devices, 'audiooutput', outputDeviceId))
      setOutputDeviceId('');
  }, [audioDeviceId, devices, outputDeviceId, videoDeviceId]);

  const previewStream = videoEnabled ? stream : null;

  /** Stops the meter stream and marks the preview video as owned by the room. */
  const handOff = useCallback((): PrejoinJoinMedia => {
    stopMediaStream(micStreamRef.current);
    micStreamRef.current = null;
    setMicStream(null);
    transferred.current = limit === 'none' ? previewStream : null;
    setHandedOff(true);
    // A room that has not assigned a role yet receives no media.
    const open = limit === 'none';
    return {
      previewStream: open ? previewStream : null,
      audioEnabled: open && audioEnabled,
      videoEnabled: open && videoEnabled,
      audioDeviceId,
      videoDeviceId,
      outputDeviceId,
    };
  }, [
    audioDeviceId,
    audioEnabled,
    limit,
    outputDeviceId,
    previewStream,
    videoDeviceId,
    videoEnabled,
  ]);

  /** A failed join takes the devices back from the room, so the preview restarts. */
  const reset = useCallback(() => {
    transferred.current = null;
    setHandedOff(false);
  }, []);

  /** Leaving releases both local streams. */
  const release = useCallback(() => {
    stopMediaStream(micStreamRef.current);
    micStreamRef.current = null;
    stopMediaStream(stream);
  }, [stream]);

  return {
    devices,
    audioEnabled,
    videoEnabled,
    toggleAudio: () => setAudioRequested((value) => !value),
    toggleVideo: () => {
      if (videoEnabled) setStream(null);
      setVideoRequested((value) => !value);
    },
    audioDeviceId,
    setAudioDeviceId,
    videoDeviceId,
    setVideoDeviceId,
    outputDeviceId,
    setOutputDeviceId,
    micStream,
    previewStream,
    previewError,
    micError,
    handedOff,
    limited: limit !== 'none',
    setLimit,
    handOff,
    release,
    reset,
  };
}

export type PrejoinCapture = ReturnType<typeof usePrejoinCapture>;
