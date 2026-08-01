'use client';

import {
  toggleWorkspaceMeetingRecording,
  uploadWorkspaceMeetingRecording,
} from '@tuturuuu/internal-api';
import { toast } from '@tuturuuu/ui/sonner';
import { useCallback, useRef, useState } from 'react';
import { pickRecorderMimeType } from '../lib/recording';

type RecordToggleResponse = {
  action?: 'started' | 'stopped';
  sessionId?: string;
};

export interface UseCallRecordingOptions {
  meetingId: string;
  /** Broadcasts the room-wide indicator so every participant sees it. */
  onStateChange: (state: 'recording' | 'idle', sessionId?: string) => void;
  wsId: string;
}

/**
 * Drives meeting recording from inside a call.
 *
 * Deliberately reuses the existing `/record` + `/upload` endpoints and the
 * `recording_sessions` table, so a call recording lands in exactly the same
 * place — and the same transcription pipeline — as one started from the
 * meeting page.
 */
export function useCallRecording({
  meetingId,
  onStateChange,
  wsId,
}: UseCallRecordingOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const sessionIdRef = useRef<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stop = useCallback(async () => {
    const recorder = recorderRef.current;
    const sessionId = sessionIdRef.current;
    if (!(recorder && sessionId)) return;

    setIsBusy(true);
    try {
      const blob = await new Promise<Blob>((resolve) => {
        recorder.addEventListener(
          'stop',
          () =>
            resolve(
              new Blob(chunksRef.current, {
                type: recorder.mimeType || 'audio/webm',
              })
            ),
          { once: true }
        );
        recorder.stop();
      });

      for (const track of streamRef.current?.getTracks() ?? []) track.stop();
      streamRef.current = null;
      recorderRef.current = null;
      chunksRef.current = [];

      if (blob.size > 0) {
        await uploadWorkspaceMeetingRecording(wsId, meetingId, sessionId, blob);
      }
      // Flips the session to pending_transcription, which is what hands the
      // audio to the existing transcription pipeline.
      await toggleWorkspaceMeetingRecording(wsId, meetingId);

      setIsRecording(false);
      sessionIdRef.current = null;
      onStateChange('idle');
    } catch {
      toast.error('Could not save the recording');
    } finally {
      setIsBusy(false);
    }
  }, [meetingId, onStateChange, wsId]);

  const start = useCallback(async () => {
    setIsBusy(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const response =
        await toggleWorkspaceMeetingRecording<RecordToggleResponse>(
          wsId,
          meetingId
        );
      if (!response?.sessionId) throw new Error('no_session');
      sessionIdRef.current = response.sessionId;

      const mimeType = pickRecorderMimeType(
        (type) =>
          typeof MediaRecorder !== 'undefined' &&
          MediaRecorder.isTypeSupported(type)
      );
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined
      );
      chunksRef.current = [];
      recorder.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      });
      recorder.start(1000);
      recorderRef.current = recorder;

      setIsRecording(true);
      onStateChange('recording', response.sessionId);
    } catch {
      for (const track of streamRef.current?.getTracks() ?? []) track.stop();
      streamRef.current = null;
      toast.error('Could not start recording');
    } finally {
      setIsBusy(false);
    }
  }, [meetingId, onStateChange, wsId]);

  const toggle = useCallback(
    () => (isRecording ? stop() : start()),
    [isRecording, start, stop]
  );

  return { isBusy, isRecording, toggle };
}
