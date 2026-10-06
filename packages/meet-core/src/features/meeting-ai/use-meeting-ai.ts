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
import { useWorkspaceActor } from '@tuturuuu/ui/hooks/use-workspace-visibility';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MeetAudioCapture, type MeetAudioSource } from './audio';
import { MeetAudioBatcher } from './audio-batches';
import { createMeetCaptureRuntime } from './capture-runtime';
import { recoverMeetChunk } from './chunk-recovery';

export function useMeetingAi(
  wsId: string,
  meetingId: string,
  streams: MeetAudioSource[] = [],
  live = true,
  enabled = true,
  expectedActorId?: string
) {
  const actor = useWorkspaceActor();
  const runtime = useMemo(
    () =>
      createMeetCaptureRuntime({
        actor,
        wsId,
        meetingId,
        enabled,
        expectedActorId,
      }),
    [actor, wsId, meetingId, enabled, expectedActorId]
  );
  const currentRuntime = useRef(runtime);
  if (currentRuntime.current !== runtime) {
    currentRuntime.current.active = false;
    currentRuntime.current = runtime;
  }
  const admitted = useCallback(() => {
    if (
      !runtime.active ||
      !enabled ||
      !actor ||
      (expectedActorId !== undefined && actor.actorId !== expectedActorId)
    )
      return false;
    try {
      actor.assertActive();
      return true;
    } catch {
      runtime.active = false;
      return false;
    }
  }, [runtime, enabled, actor, expectedActorId]);
  const assertScope = () => {
    if (!admitted())
      throw new DOMException('Meeting scope changed', 'AbortError');
  };
  const query = useQuery({
    queryKey: ['meet-ai', actor?.actorId, wsId, meetingId],
    enabled:
      enabled &&
      actor != null &&
      (expectedActorId === undefined || actor.actorId === expectedActorId),
    queryFn: async () => {
      assertScope();
      const result = await getMeetAiState(wsId, meetingId);
      assertScope();
      return result;
    },
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
    mutationFn: () => {
      assertScope();
      return updateMeetAiSession(wsId, meetingId, { action: 'start' });
    },
    retry: false,
  });
  const { mutateAsync: finishSession } = useMutation({
    mutationFn: (payload: Parameters<typeof updateMeetAiSession>[2]) => {
      assertScope();
      return updateMeetAiSession(wsId, meetingId, payload);
    },
    retry: false,
  });
  const { mutateAsync: uploadChunk } = useMutation({
    mutationFn: ({ data, signal }: { data: FormData; signal: AbortSignal }) => {
      assertScope();
      return uploadMeetAiChunk(wsId, meetingId, data, undefined, signal);
    },
    retry: false,
  });
  const [busy, setBusy] = useState(false);
  const [ownsSession, setOwnsSession] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [captureError, setCaptureError] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [pendingChunks, setPendingChunks] = useState(0);
  const streamsRef = useRef(streams);
  streamsRef.current = streams;

  useEffect(() => {
    runtime.capture.current?.update(streams);
  }, [streams, runtime]);
  useEffect(() => {
    if (!admitted() || runtime.busyRef.current || !runtime.session.current)
      return;
    const current = query.data?.sessions.find(
      (entry) => entry.id === runtime.session.current
    );
    if (current?.ended_at) {
      runtime.recovery.current.abort();
      runtime.capture.current?.dispose();
      runtime.batches.current?.dispose();
      if (runtime.durationTimer.current)
        clearTimeout(runtime.durationTimer.current);
      runtime.capture.current = null;
      setCapturing(false);
      runtime.session.current = null;
      setOwnsSession(false);
    }
  }, [query.data, runtime, admitted]);
  useEffect(() => {
    runtime.active = true;
    runtime.mounted.current = true;
    setBusy(false);
    setOwnsSession(false);
    setCapturing(false);
    setCaptureError(false);
    setRecovering(false);
    setPendingChunks(0);
    return () => {
      runtime.active = false;
      runtime.mounted.current = false;
      runtime.preparing.current?.dispose();
      runtime.recovery.current.abort();
      runtime.capture.current?.dispose();
      runtime.batches.current?.dispose();
      if (runtime.durationTimer.current)
        clearTimeout(runtime.durationTimer.current);
    };
  }, [runtime]);

  const start = useCallback(async () => {
    if (!admitted() || runtime.capture.current || runtime.busyRef.current)
      return;
    if (runtime.pending.current)
      throw new Error('Previous transcription is still finishing');
    runtime.recovery.current = new AbortController();
    runtime.busyRef.current = true;
    let finishStarting!: () => void;
    runtime.starting.current = new Promise<void>((resolve) => {
      finishStarting = resolve;
    });
    setBusy(true);
    setCaptureError(false);
    runtime.errorRef.current = false;
    runtime.autoFinishRequested.current = false;
    const overflow = () => {
      if (!admitted()) return;
      recorder.dispose();
      batcher.dispose();
      runtime.capture.current = null;
      setCapturing(false);
      setCaptureError(true);
      runtime.errorRef.current = true;
      if (!runtime.autoFinishRequested.current) {
        runtime.autoFinishRequested.current = true;
        void runtime.queue.current
          .then(() => runtime.finishRef.current?.())
          .catch(() => {
            // Keep the partial session recoverable when finalization fails.
            if (admitted()) setCaptureError(true);
          });
      }
    };
    const batcher = new MeetAudioBatcher((clips) => {
      const sessionId = runtime.session.current;
      if (!admitted() || !sessionId) return;
      const bytes = clips.reduce((sum, clip) => sum + clip.audio.size, 0);
      if (
        runtime.pendingBytes.current + bytes > MEET_AUDIO_PENDING_MAX_BYTES ||
        runtime.sequence.current >= MEET_AUDIO_SESSION_MAX_BATCHES
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
      data.set('sequence', String(runtime.sequence.current++));
      data.set(
        'startSeconds',
        String(Math.min(...clips.map((clip) => clip.startSeconds)))
      );
      runtime.pendingBytes.current += bytes;
      runtime.pending.current++;
      setPendingChunks(runtime.pending.current);
      const recoverySignal = runtime.recovery.current.signal;
      runtime.queue.current = runtime.queue.current.then(async () => {
        try {
          if (!admitted()) return;
          await recoverMeetChunk((signal) => uploadChunk({ data, signal }), {
            // Queued clips must get their own recovery window when uploaded.
            deadline: Date.now() + 5 * 60_000,
            signal: recoverySignal,
            onRetry: () => {
              if (admitted() && runtime.mounted.current) setRecovering(true);
            },
          });
        } catch {
          if (admitted() && runtime.mounted.current) setCaptureError(true);
          if (admitted()) runtime.errorRef.current = true;
        } finally {
          runtime.pending.current--;
          runtime.pendingBytes.current -= bytes;
          if (admitted() && runtime.mounted.current) {
            setPendingChunks(runtime.pending.current);
            setRecovering(false);
          }
        }
      });
    }, overflow);
    const recorder = new MeetAudioCapture((audio, startSeconds, source) => {
      if (!admitted()) return;
      batcher.add({
        audio,
        startSeconds,
        kind: source?.kind ?? 'microphone',
        accountId: source?.accountId,
      });
    });
    runtime.preparing.current = recorder;
    try {
      // Establish browser support before allocating the server session.
      await recorder.start();
      if (!admitted() || !runtime.mounted.current) {
        recorder.dispose();
        return;
      }
      const result = await startSession();
      if (!admitted() || !runtime.mounted.current) {
        recorder.dispose();
        return;
      }
      runtime.preparing.current = null;
      runtime.session.current = result.sessionId;
      setOwnsSession(true);
      runtime.sequence.current = 0;
      runtime.capture.current = recorder;
      runtime.batches.current = batcher;
      batcher.start();
      // Flush before the database's three-hour reservation expiry.
      runtime.durationTimer.current = setTimeout(
        () => {
          void runtime.finishRef.current?.().catch(() => {
            if (admitted()) runtime.errorRef.current = true;
            if (admitted() && runtime.mounted.current) setCaptureError(true);
          });
        },
        3 * 60 * 60 * 1000 - 15_000
      );
      recorder.update(streamsRef.current);
      setCapturing(true);
      if (admitted()) await query.refetch();
    } catch (error) {
      recorder.dispose();
      batcher.dispose();
      if (admitted()) throw error;
    } finally {
      runtime.busyRef.current = false;
      runtime.starting.current = null;
      finishStarting();
      if (admitted() && runtime.mounted.current) setBusy(false);
    }
  }, [query.refetch, startSession, uploadChunk, runtime, admitted]);

  const finish = useCallback(
    async (sessionId?: string) => {
      if (!admitted()) return;
      await runtime.starting.current;
      if (!admitted()) return;
      const target = sessionId ?? runtime.session.current;
      if (!target) return;
      if (runtime.busyRef.current)
        throw new Error('Meeting AI is already processing');
      runtime.busyRef.current = true;
      setBusy(true);
      try {
        if (target === runtime.session.current) {
          if (runtime.durationTimer.current)
            clearTimeout(runtime.durationTimer.current);
          runtime.durationTimer.current = null;
          runtime.batches.current?.flush();
          const flushed =
            !runtime.capture.current || (await runtime.capture.current.stop());
          if (!admitted()) return;
          if (!flushed) {
            if (admitted()) runtime.errorRef.current = true;
            setCaptureError(true);
          }
          runtime.capture.current = null;
          runtime.batches.current?.stop();
          runtime.batches.current = null;
          setCapturing(false);
          await runtime.queue.current;
          if (!admitted()) return;
        }
        await finishSession({
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          action: 'finish',
          sessionId: target,
          expectedChunks:
            target === runtime.session.current
              ? runtime.sequence.current
              : undefined,
          captureIncomplete:
            target === runtime.session.current
              ? runtime.errorRef.current
              : true,
        });
        if (!admitted()) return;
        if (target === runtime.session.current) {
          runtime.session.current = null;
          setOwnsSession(false);
        }
        if (admitted()) await query.refetch();
      } catch (error) {
        if (admitted()) throw error;
      } finally {
        runtime.busyRef.current = false;
        if (admitted()) setBusy(false);
      }
    },
    [query.refetch, finishSession, runtime, admitted]
  );
  runtime.finishRef.current = finish;
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
