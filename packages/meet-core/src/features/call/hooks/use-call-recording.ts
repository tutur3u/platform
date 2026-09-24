'use client';
import {
  toggleWorkspaceMeetingRecording,
  updateWorkspaceMeetingRecording,
  uploadWorkspaceMeetingRecording,
} from '@tuturuuu/internal-api';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { pickRecorderMimeType } from '../lib/recording';

type RecordToggleResponse = {
  action?: 'started' | 'stopped';
  sessionId?: string;
};
export interface UseCallRecordingOptions {
  meetingId: string;
  onStateChange: (state: 'recording' | 'idle', sessionId?: string) => void;
  wsId: string;
}
export function useCallRecording({
  meetingId,
  onStateChange,
  wsId,
}: UseCallRecordingOptions) {
  const t = useTranslations('meet.call');
  const [isRecording, setIsRecording] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const cancelled = useRef(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef<string | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const starting = useRef<Promise<void> | null>(null);
  const finishing = useRef<Promise<void> | null>(null);
  const stopRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const stopTracks = useCallback(() => {
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
  }, []);
  useEffect(
    () => () => {
      void stopRef.current();
    },
    []
  );

  const finishRecording = useCallback(async () => {
    const recorder = recorderRef.current,
      sessionId = sessionRef.current;
    if (!recorder || !sessionId) {
      stopTracks();
      return;
    }
    recorderRef.current = null;
    setIsBusy(true);
    try {
      const blob =
        recorder.state === 'inactive'
          ? new Blob(chunksRef.current, {
              type: recorder.mimeType || 'audio/webm',
            })
          : await new Promise<Blob>((resolve) => {
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
              stopTracks();
            });
      stopTracks();
      if (blob.size > 0)
        await uploadWorkspaceMeetingRecording(wsId, meetingId, sessionId, blob);
      await updateWorkspaceMeetingRecording(
        wsId,
        meetingId,
        sessionId,
        { status: blob.size > 0 ? 'pending_transcription' : 'failed' },
        'PUT'
      );
    } catch {
      toast.error(t('record_save_failed'));
    } finally {
      stopTracks();
      streamRef.current = null;
      chunksRef.current = [];
      sessionRef.current = null;
      setIsRecording(false);
      setIsBusy(false);
      onStateChange('idle');
    }
  }, [meetingId, onStateChange, stopTracks, t, wsId]);
  const stop = useCallback(() => {
    cancelled.current = true;
    if (finishing.current) return finishing.current;
    // Permission/API startup may be pending, but the device is released immediately.
    if (!recorderRef.current) stopTracks();
    const task = starting.current
      ? starting.current.then(finishRecording)
      : finishRecording();
    finishing.current = task;
    void task.finally(() => {
      if (finishing.current === task) finishing.current = null;
    });
    return task;
  }, [finishRecording, stopTracks]);
  stopRef.current = stop;

  const start = useCallback(() => {
    if (starting.current || finishing.current)
      return starting.current ?? finishing.current!;
    cancelled.current = false;
    setIsBusy(true);
    const task = (async () => {
      let openedSession: string | null = null;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        if (cancelled.current) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }
        streamRef.current = stream;
        const response =
          await toggleWorkspaceMeetingRecording<RecordToggleResponse>(
            wsId,
            meetingId
          );
        if (!response?.sessionId) throw new Error('no_session');
        if (response.action !== 'started') {
          stopTracks();
          streamRef.current = null;
          onStateChange('idle');
          return;
        }
        openedSession = response.sessionId;
        if (cancelled.current) {
          stopTracks();
          await updateWorkspaceMeetingRecording(
            wsId,
            meetingId,
            openedSession,
            { status: 'failed' },
            'PUT'
          );
          return;
        }
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
        sessionRef.current = openedSession;
        recorder.addEventListener('dataavailable', (event) => {
          if (event.data.size > 0) chunksRef.current.push(event.data);
        });
        recorder.addEventListener('stop', () => {
          if (recorderRef.current === recorder) void stopRef.current();
        });
        recorder.start(1000);
        recorderRef.current = recorder;
        setIsRecording(true);
        onStateChange('recording', openedSession);
      } catch {
        stopTracks();
        streamRef.current = null;
        if (openedSession)
          await updateWorkspaceMeetingRecording(
            wsId,
            meetingId,
            openedSession,
            { status: 'failed' },
            'PUT'
          ).catch(() => undefined);
        toast.error(t('record_start_failed'));
      } finally {
        setIsBusy(false);
      }
    })();
    starting.current = task;
    void task.finally(() => {
      if (starting.current === task) starting.current = null;
    });
    return task;
  }, [meetingId, onStateChange, stopTracks, t, wsId]);
  const toggle = useCallback(
    () => (isRecording ? stop() : start()),
    [isRecording, start, stop]
  );
  return { isBusy, isRecording, toggle, stop };
}
