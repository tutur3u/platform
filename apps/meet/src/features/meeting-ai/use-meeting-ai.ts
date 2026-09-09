'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import {
  getMeetAiState,
  updateMeetAiSession,
  uploadMeetAiChunk,
} from '@tuturuuu/internal-api';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MeetAudioCapture } from './audio';
import { recoverMeetChunk } from './chunk-recovery';

export function useMeetingAi(
  wsId: string,
  meetingId: string,
  streams: MediaStream[] = [],
  live = true,
  enabled = true
) {
  const query = useQuery({
    queryKey: ['meet-ai', wsId, meetingId],
    enabled,
    queryFn: () => getMeetAiState(wsId, meetingId),
    refetchInterval: (current) =>
      live ||
      current.state.data?.sessions.some(
        (entry) =>
          !entry.ended_at ||
          entry.notes_status === 'processing' ||
          (entry.notes_status === 'pending' &&
            Date.now() - Date.parse(entry.ended_at) < 120_000)
      )
        ? 4000
        : false,
    retry: false,
  });
  const { mutateAsync: startSession } = useMutation({
    mutationFn: () => updateMeetAiSession(wsId, meetingId, { action: 'start' }),
    retry: false,
  });
  const { mutateAsync: finishSession } = useMutation({
    mutationFn: (payload: Parameters<typeof updateMeetAiSession>[2]) =>
      updateMeetAiSession(wsId, meetingId, payload),
    retry: false,
  });
  const { mutateAsync: uploadChunk } = useMutation({
    mutationFn: (data: FormData) => uploadMeetAiChunk(wsId, meetingId, data),
    retry: false,
  });
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const mounted = useRef(true);
  const starting = useRef<Promise<void> | null>(null);
  const [ownsSession, setOwnsSession] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [captureError, setCaptureError] = useState(false);
  const errorRef = useRef(false);
  const [recovering, setRecovering] = useState(false);
  const [pendingChunks, setPendingChunks] = useState(0);
  const capture = useRef<MeetAudioCapture | null>(null);
  const session = useRef<string | null>(null);
  const queue = useRef(Promise.resolve());
  const pending = useRef(0);
  const sequence = useRef(0);
  const finishRef = useRef<(() => Promise<void>) | null>(null);
  const autoFinishRequested = useRef(false);
  const streamsRef = useRef(streams);
  streamsRef.current = streams;

  useEffect(() => {
    capture.current?.update(streams);
  }, [streams]);
  useEffect(() => {
    if (busyRef.current || !session.current) return;
    const current = query.data?.sessions.find(
      (entry) => entry.id === session.current
    );
    if (current?.ended_at) {
      capture.current?.dispose();
      capture.current = null;
      setCapturing(false);
      session.current = null;
      setOwnsSession(false);
    }
  }, [query.data]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      capture.current?.dispose();
    };
  }, []);

  const start = useCallback(async () => {
    if (capture.current || busyRef.current) return;
    busyRef.current = true;
    let finishStarting!: () => void;
    starting.current = new Promise<void>((resolve) => {
      finishStarting = resolve;
    });
    setBusy(true);
    setCaptureError(false);
    errorRef.current = false;
    autoFinishRequested.current = false;
    const recorder = new MeetAudioCapture((audio, startSeconds) => {
      const sessionId = session.current;
      if (!sessionId) return;
      if (pending.current >= 60 || sequence.current >= 1080) {
        recorder.dispose();
        capture.current = null;
        setCapturing(false);
        setCaptureError(true);
        errorRef.current = true;
        if (!autoFinishRequested.current) {
          autoFinishRequested.current = true;
          void queue.current
            .then(() => finishRef.current?.())
            .catch(() => {
              // Keep the partial session recoverable when finalization fails.
              setCaptureError(true);
            });
        }
        return;
      }
      const data = new FormData();
      data.set('audio', audio, 'chunk.wav');
      data.set('sessionId', sessionId);
      data.set('id', crypto.randomUUID());
      data.set('sequence', String(sequence.current++));
      data.set('startSeconds', String(startSeconds));
      pending.current++;
      setPendingChunks(pending.current);
      const deadline = Date.now() + 5 * 60_000;
      queue.current = queue.current.then(async () => {
        try {
          await recoverMeetChunk(() => uploadChunk(data), {
            deadline,
            onRetry: () => {
              if (mounted.current) setRecovering(true);
            },
          });
        } catch {
          setCaptureError(true);
          errorRef.current = true;
        } finally {
          pending.current--;
          if (mounted.current) {
            setPendingChunks(pending.current);
            setRecovering(false);
          }
        }
      });
    });
    try {
      // Establish browser support before allocating the server session.
      await recorder.start();
      if (!mounted.current) {
        recorder.dispose();
        return;
      }
      const result = await startSession();
      if (!mounted.current) {
        recorder.dispose();
        await finishSession({
          action: 'finish',
          sessionId: result.sessionId,
          expectedChunks: 0,
          captureIncomplete: true,
        });
        return;
      }
      session.current = result.sessionId;
      setOwnsSession(true);
      sequence.current = 0;
      capture.current = recorder;
      recorder.update(streamsRef.current);
      setCapturing(true);
      await query.refetch();
    } catch (error) {
      recorder.dispose();
      throw error;
    } finally {
      busyRef.current = false;
      starting.current = null;
      finishStarting();
      if (mounted.current) setBusy(false);
    }
  }, [query.refetch, startSession, uploadChunk, finishSession]);

  const finish = useCallback(
    async (sessionId?: string) => {
      await starting.current;
      const target = sessionId ?? session.current;
      if (!target) return;
      if (busyRef.current) throw new Error('Meeting AI is already processing');
      busyRef.current = true;
      setBusy(true);
      try {
        if (target === session.current) {
          if (capture.current && !(await capture.current.stop())) {
            errorRef.current = true;
            setCaptureError(true);
          }
          capture.current = null;
          setCapturing(false);
          await queue.current;
        }
        await finishSession({
          action: 'finish',
          sessionId: target,
          expectedChunks:
            target === session.current ? sequence.current : undefined,
          captureIncomplete:
            target === session.current ? errorRef.current : true,
        });
        if (target === session.current) {
          session.current = null;
          setOwnsSession(false);
        }
        await query.refetch();
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [query.refetch, finishSession]
  );
  finishRef.current = finish;
  return {
    ...query,
    busy,
    capturing,
    captureError,
    recovering,
    pendingChunks,
    start,
    finish,
    ownsSession,
  };
}
