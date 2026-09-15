'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import {
  MEET_AUDIO_PENDING_MAX_BYTES,
  MEET_AUDIO_SESSION_MAX_BATCHES,
} from '@tuturuuu/ai/meetings/audio-contract';
import {
  getMeetAiState,
  updateMeetAiSession,
  uploadMeetAiChunk,
} from '@tuturuuu/internal-api';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MeetAudioCapture, type MeetAudioSource } from './audio';
import { MeetAudioBatcher } from './audio-batches';
import { recoverMeetChunk } from './chunk-recovery';

export function useMeetingAi(
  wsId: string,
  meetingId: string,
  streams: MeetAudioSource[] = [],
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
    mutationFn: ({ data, signal }: { data: FormData; signal: AbortSignal }) =>
      uploadMeetAiChunk(wsId, meetingId, data, undefined, signal),
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
  const durationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const session = useRef<string | null>(null);
  const queue = useRef(Promise.resolve());
  const pending = useRef(0);
  const pendingBytes = useRef(0);
  const batches = useRef<MeetAudioBatcher | null>(null);
  const recovery = useRef(new AbortController());
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
      recovery.current.abort();
      capture.current?.dispose();
      batches.current?.dispose();
      if (durationTimer.current) clearTimeout(durationTimer.current);
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
      recovery.current.abort();
      capture.current?.dispose();
      batches.current?.dispose();
      if (durationTimer.current) clearTimeout(durationTimer.current);
    };
  }, []);

  const start = useCallback(async () => {
    if (capture.current || busyRef.current) return;
    if (pending.current)
      throw new Error('Previous transcription is still finishing');
    recovery.current = new AbortController();
    busyRef.current = true;
    let finishStarting!: () => void;
    starting.current = new Promise<void>((resolve) => {
      finishStarting = resolve;
    });
    setBusy(true);
    setCaptureError(false);
    errorRef.current = false;
    autoFinishRequested.current = false;
    const overflow = () => {
      recorder.dispose();
      batcher.dispose();
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
    };
    const batcher = new MeetAudioBatcher((clips) => {
      const sessionId = session.current;
      if (!sessionId) return;
      const bytes = clips.reduce((sum, clip) => sum + clip.audio.size, 0);
      if (
        pendingBytes.current + bytes > MEET_AUDIO_PENDING_MAX_BYTES ||
        sequence.current >= MEET_AUDIO_SESSION_MAX_BATCHES
      ) {
        overflow();
        return;
      }
      const data = new FormData();
      clips.forEach((clip, index) => {
        data.set(`audio_${index}`, clip.audio, `source-${index}.wav`);
      });
      data.set(
        'sources',
        JSON.stringify(
          clips.map((clip) => ({
            speakerAccountId: clip.accountId,
            sourceKind: clip.kind,
            startSeconds: clip.startSeconds,
          }))
        )
      );
      data.set('sessionId', sessionId);
      data.set('id', crypto.randomUUID());
      data.set('sequence', String(sequence.current++));
      data.set(
        'startSeconds',
        String(Math.min(...clips.map((clip) => clip.startSeconds)))
      );
      pendingBytes.current += bytes;
      pending.current++;
      setPendingChunks(pending.current);
      const recoverySignal = recovery.current.signal;
      const deadline = Date.now() + 5 * 60_000;
      queue.current = queue.current.then(async () => {
        try {
          await recoverMeetChunk((signal) => uploadChunk({ data, signal }), {
            deadline,
            signal: recoverySignal,
            onRetry: () => {
              if (mounted.current) setRecovering(true);
            },
          });
        } catch {
          if (mounted.current) setCaptureError(true);
          errorRef.current = true;
        } finally {
          pending.current--;
          pendingBytes.current -= bytes;
          if (mounted.current) {
            setPendingChunks(pending.current);
            setRecovering(false);
          }
        }
      });
    }, overflow);
    const recorder = new MeetAudioCapture((audio, startSeconds, source) =>
      batcher.add({
        audio,
        startSeconds,
        kind: source?.kind ?? 'microphone',
        accountId: source?.accountId,
      })
    );
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
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
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
      batches.current = batcher;
      batcher.start();
      // Flush before the database's three-hour reservation expiry.
      durationTimer.current = setTimeout(
        () => {
          void finishRef.current?.().catch(() => {
            errorRef.current = true;
            if (mounted.current) setCaptureError(true);
          });
        },
        3 * 60 * 60 * 1000 - 15_000
      );
      recorder.update(streamsRef.current);
      setCapturing(true);
      await query.refetch();
    } catch (error) {
      recorder.dispose();
      batcher.dispose();
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
          if (durationTimer.current) clearTimeout(durationTimer.current);
          durationTimer.current = null;
          batches.current?.flush();
          if (capture.current && !(await capture.current.stop())) {
            errorRef.current = true;
            setCaptureError(true);
          }
          capture.current = null;
          batches.current?.stop();
          batches.current = null;
          setCapturing(false);
          await queue.current;
        }
        await finishSession({
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
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
    meetingId,
    wsId,
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
