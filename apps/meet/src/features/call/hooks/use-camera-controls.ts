import type { MeetMediaState } from '@tuturuuu/realtime/meet';
import { useCallback, useState } from 'react';
import { adoptCameraPreview } from '../lib/adopt-camera-preview';
import {
  type CameraEffects,
  type CameraLook,
  DEFAULT_CAMERA_LOOK,
} from '../lib/camera-effects';

export function useCameraControls(
  effects: CameraEffects,
  activeRef: { current: boolean },
  localStreamRef: { current: MediaStream | null },
  mediaRef: { current: MeetMediaState },
  setLocalStream: (stream: MediaStream) => void,
  queueLocalTracks: (
    stream: MediaStream,
    media: MeetMediaState
  ) => Promise<void>
) {
  const [cameraLook, setCameraLookState] =
    useState<CameraLook>(DEFAULT_CAMERA_LOOK);
  const setCameraLook = useCallback(
    async (look: CameraLook) => {
      const track = await effects.setLook(look);
      setCameraLookState(look);
      if (!track || !activeRef.current) return;
      const stream = new MediaStream([
        ...(localStreamRef.current?.getAudioTracks() ?? []),
        track,
      ]);
      localStreamRef.current = stream;
      setLocalStream(stream);
      await queueLocalTracks(stream, mediaRef.current);
    },
    [
      effects,
      queueLocalTracks,
      activeRef,
      localStreamRef,
      mediaRef,
      setLocalStream,
    ]
  );

  const adoptPreview = useCallback(
    (stream: MediaStream | null) =>
      adoptCameraPreview(
        stream,
        activeRef,
        effects,
        localStreamRef,
        setLocalStream
      ),
    [effects, activeRef, localStreamRef, setLocalStream]
  );
  return { cameraLook, setCameraLook, adoptPreview };
}
