import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { MeetProgrammingCheckLanguage } from '@tuturuuu/internal-api/meet-call';
import type { PlaygroundLanguage } from '@tuturuuu/types/primitives/playgrounds';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  CHECK_PAUSE_MIN_S,
  CHECK_WARMING_BUDGET_MS,
  CHECK_WARMING_SPACING_MS,
  type CheckFiles,
  checkHash,
  checkIdleMs,
  checkRefusal,
  checkSize,
  type DiagnosticsStatus,
  diagnosticsProvider,
  markersByPath,
  type WorkbenchCheck,
} from './code-diagnostics';
import type { CheckMarkerSink } from './editor-markers';

function subscribeVisibility(onChange: () => void) {
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
}
const documentVisible = () => document.visibilityState !== 'hidden';

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException('Check superseded by an edit', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, ms);
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
  });
}

type Stop = {
  language: PlaygroundLanguage;
  kind: 'unavailable' | 'unsupported' | 'quota';
};

/**
 * Compiler problems for C, C++ and Java from the room's `?check` endpoint.
 * Only a local edit starts a check, 1.5 s (2.5 s for Java) after the last
 * keystroke while the panel is mounted and the page is visible: every
 * participant's check is charged to the room's quota, so a remote change
 * leaves this browser's markers as they are. An edit aborts the check in
 * flight and an unchanged room is never checked twice. A checker that is
 * warming up is retried quietly for a time budget, then treated as
 * unavailable; unavailable and quota refusals pause checks for their retry
 * time (at least a minute when unavailable) and the next local edit resumes
 * them. A checker that is not deployed or does not take the language turns
 * the status off without a message.
 */
export function useRemoteDiagnostics({
  roomKey,
  language,
  files,
  check,
  sink,
  enabled = true,
  localEdits,
}: {
  roomKey: string;
  language: PlaygroundLanguage | undefined;
  files: CheckFiles;
  check: WorkbenchCheck | undefined;
  sink: CheckMarkerSink;
  enabled?: boolean;
  /** Subscribes to edits made in this browser; without it every change counts as local. */
  localEdits?: (onEdit: () => void) => () => void;
}): DiagnosticsStatus {
  const client = useQueryClient();
  const remote =
    enabled &&
    !!language &&
    diagnosticsProvider(language, !!check) === 'remote';
  const visible = useSyncExternalStore(
    subscribeVisibility,
    documentVisible,
    () => false
  );
  // Hashing and encoding the files is skipped where nothing is checked.
  const hash = useMemo(
    () => (remote ? checkHash(language ?? '', files) : ''),
    [remote, language, files]
  );
  const size = useMemo(
    () => (remote ? checkSize(files) : 'empty'),
    [remote, files]
  );
  const latest = useRef(files);
  latest.current = files;
  // When this browser last changed a file; a change that follows it by more
  // than the idle delay came from the room.
  const editedAt = useRef(Number.NEGATIVE_INFINITY);
  // A local edit's check is armed until its timer fires, whatever room changes land meanwhile.
  const armed = useRef(false);
  useEffect(
    () =>
      localEdits?.(() => {
        editedAt.current = performance.now();
      }),
    [localEdits]
  );
  // `n` makes every settle its own query, so useQuery owns every request.
  const [settled, setSettled] = useState<{
    hash: string;
    files: CheckFiles;
    n: number;
  }>();
  const settledHash = useRef<string | undefined>(undefined);
  settledHash.current = settled?.hash;
  const checkedHash = useRef<string | undefined>(undefined);
  const [stop, setStop] = useState<Stop>();
  const pauseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );
  useEffect(() => () => clearTimeout(pauseTimer.current), []);
  const [last, setLast] = useState<{
    language: PlaygroundLanguage;
    problems: number;
  }>();
  const stopped = stop && stop.language === language ? stop.kind : undefined;
  const checkable = size === 'ok';
  // An edit aborts the check in flight; the idle delay settles the next one.
  useEffect(() => {
    if (!remote || !checkable) {
      armed.current = false;
      return;
    }
    if (
      localEdits &&
      !armed.current &&
      performance.now() - editedAt.current > checkIdleMs(language)
    )
      return;
    armed.current = true;
    // A new hash aborts the check in flight and drops the pending settle, so
    // undoing back to the aborted text waits for the idle delay like any edit.
    if (settledHash.current !== hash) {
      void client.cancelQueries({
        queryKey: ['playground-check', roomKey],
        exact: false,
      });
      setSettled(undefined);
    }
    const timer = setTimeout(() => {
      armed.current = false;
      if (checkedHash.current !== hash)
        setSettled((value) => ({
          hash,
          files: latest.current,
          n: (value?.n ?? 0) + 1,
        }));
    }, checkIdleMs(language));
    return () => clearTimeout(timer);
  }, [client, remote, checkable, localEdits, roomKey, language, hash]);
  // Problems belong to this room and language; leaving either clears them.
  useEffect(() => () => sink.clear(roomKey), [sink, roomKey, language]);
  // Files over the limits are never checked, so problems from a smaller version are stale.
  const oversized = remote && size === 'large' && stopped !== 'unsupported';
  useEffect(() => {
    if (!oversized) return;
    sink.clear(roomKey);
    // The cleared problems must come back if the room shrinks to what was checked.
    checkedHash.current = undefined;
  }, [sink, roomKey, oversized]);
  const pause = (paused: Stop, seconds: number) => {
    setStop(paused);
    clearTimeout(pauseTimer.current);
    pauseTimer.current = setTimeout(() => {
      setStop((value) => (value === paused ? undefined : value));
      // The edit that was paused is not retried; the next local edit is.
      setSettled(undefined);
    }, seconds * 1000);
  };
  const query = useQuery({
    queryKey: [
      'playground-check',
      roomKey,
      language,
      settled?.hash,
      settled?.n,
    ],
    enabled:
      remote &&
      visible &&
      checkable &&
      !stopped &&
      !!settled &&
      settled.hash === hash,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async ({ signal }) => {
      const checked = settled!.files;
      const checkedLanguage = language!;
      const checkedFor = settled!.hash;
      let warmingSince: number | undefined;
      let conflicted = false;
      for (;;) {
        try {
          const result = await check!(
            {
              requestId: crypto.randomUUID(),
              language: checkedLanguage as MeetProgrammingCheckLanguage,
              files: checked,
            },
            signal
          );
          if (signal.aborted) throw signal.reason;
          sink.set(roomKey, markersByPath(checked, result.diagnostics));
          checkedHash.current = checkedFor;
          setLast({
            language: checkedLanguage,
            problems: result.diagnostics.length,
          });
          return result.diagnostics.length;
        } catch (error) {
          const refusal = checkRefusal(error);
          // Each attempt is charged to the quota, so warming is bounded by
          // time and spaced out. A busy checker is not retried: the next
          // local edit asks again.
          if (refusal.kind === 'warming') {
            warmingSince ??= Date.now();
            const wait = Math.max(
              refusal.retryAfterSeconds * 1000,
              CHECK_WARMING_SPACING_MS
            );
            if (Date.now() - warmingSince + wait <= CHECK_WARMING_BUDGET_MS) {
              await sleep(wait, signal);
              continue;
            }
          }
          if (refusal.kind === 'conflict' && !conflicted) {
            conflicted = true;
            continue;
          }
          if (refusal.kind === 'warming')
            pause(
              { language: checkedLanguage, kind: 'unavailable' },
              CHECK_PAUSE_MIN_S
            );
          else if (refusal.kind === 'unavailable')
            pause(
              { language: checkedLanguage, kind: 'unavailable' },
              Math.max(refusal.retryAfterSeconds, CHECK_PAUSE_MIN_S)
            );
          else if (refusal.kind === 'unsupported') {
            sink.clear(roomKey);
            setStop({ language: checkedLanguage, kind: 'unsupported' });
          } else if (refusal.kind === 'quota')
            pause(
              { language: checkedLanguage, kind: 'quota' },
              refusal.retryAfterSeconds
            );
          // A superseded, aborted or failed check keeps the last problems.
          throw error;
        }
      }
    },
  });
  if (!remote || stopped === 'unsupported' || size === 'empty')
    return { kind: 'off' };
  if (size === 'large') return { kind: 'tooLarge' };
  if (stopped) return { kind: 'paused' };
  if (query.isFetching) return { kind: 'checking' };
  return last?.language === language
    ? { kind: 'ready', problems: last.problems }
    : { kind: 'off' };
}
