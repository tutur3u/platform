'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import {
  getMeetAiState,
  updateMeetAiSession,
  uploadMeetAiChunk,
} from '@tuturuuu/internal-api';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MeetAudioCapture } from './audio';

export function useMeetingAi(
  wsId: string,
  meetingId: string,
  streams: MediaStream[] = []
) {
  const query = useQuery({
    queryKey: ['meet-ai', wsId, meetingId],
    queryFn: () => getMeetAiState(wsId, meetingId),
    refetchInterval: 4000,
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
  const [ownsSession, setOwnsSession] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [captureError, setCaptureError] = useState(false);
  const errorRef = useRef(false);
  const capture = useRef<MeetAudioCapture | null>(null);
  const session = useRef<string | null>(null);
  const queue = useRef(Promise.resolve());
  const pending = useRef(0);
  const sequence = useRef(0);
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
    }
  }, [query.data]);
  useEffect(
    () => () => {
      capture.current?.dispose();
    },
    []
  );

  const start = useCallback(async () => {
    if (capture.current || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setCaptureError(false);
    errorRef.current = false;
    const recorder = new MeetAudioCapture((audio, startSeconds) => {
      const sessionId = session.current;
      if (!sessionId) return;
      if (pending.current >= 6 || sequence.current >= 1080) {
        recorder.dispose();
        capture.current = null;
        setCapturing(false);
        setCaptureError(true);
        errorRef.current = true;
        return;
      }
      const data = new FormData();
      data.set('audio', audio, 'chunk.wav');
      data.set('sessionId', sessionId);
      data.set('id', crypto.randomUUID());
      data.set('sequence', String(sequence.current++));
      data.set('startSeconds', String(startSeconds));
      pending.current++;
      queue.current = queue.current.then(async () => {
        try {
          const result = await uploadChunk(data);
          if (result.status !== 'completed') {
            setCaptureError(true);
            errorRef.current = true;
          }
        } catch {
          setCaptureError(true);
          errorRef.current = true;
        } finally {
          pending.current--;
        }
      });
    });
    try {
      // Establish browser support before allocating the server session.
      await recorder.start();
      const result = await startSession();
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
      setBusy(false);
    }
  }, [query.refetch, startSession, uploadChunk]);

  const finish = useCallback(
    async (sessionId?: string) => {
      const target = sessionId ?? session.current;
      if (!target) return;
      if (busyRef.current) throw new Error('Meeting AI is already processing');
      busyRef.current = true;
      setBusy(true);
      try {
        if (target === session.current) {
          await capture.current?.stop();
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
  return {
    ...query,
    busy,
    capturing,
    captureError,
    start,
    finish,
    ownsSession,
  };
}
