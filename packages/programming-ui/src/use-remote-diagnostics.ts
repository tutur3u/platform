import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { MeetProgrammingCheckLanguage } from '@tuturuuu/internal-api/meet-call';
import type { PlaygroundLanguage } from '@tuturuuu/types/primitives/playgrounds';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  CHECK_WARMING_RETRIES,
  type CheckFiles,
  checkHash,
  checkIdleMs,
  checkRefusal,
  type DiagnosticsStatus,
  diagnosticsProvider,
  markersByPath,
  type WorkbenchCheck,
  withinCheckLimits,
} from './code-diagnostics';
import type { CheckMarkerSink } from './editor-markers';

/** A busy checker is waited on this many times per edit; the next edit tries again. */
const CHECK_BUSY_RETRIES = 3;

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
 * A check runs 1.5 s (2.5 s for Java) after the last edit while the panel is mounted and the
 * page is visible; an edit aborts the one in flight and an unchanged room is
 * never checked twice. A checker that is warming up is retried quietly, then
 * treated as unavailable: checks pause until the language changes or the
 * panel reopens. A checker that is not deployed or does not take the
 * language turns the status off without a message.
 */
export function useRemoteDiagnostics({
  roomKey,
  language,
  files,
  check,
  sink,
  enabled = true,
}: {
  roomKey: string;
  language: PlaygroundLanguage | undefined;
  files: CheckFiles;
  check: WorkbenchCheck | undefined;
  sink: CheckMarkerSink;
  enabled?: boolean;
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
  const hash = checkHash(language ?? '', files);
  const latest = useRef(files);
  latest.current = files;
  const [settled, setSettled] = useState<{ hash: string; files: CheckFiles }>();
  const settledHash = useRef<string | undefined>(undefined);
  settledHash.current = settled?.hash;
  const [stop, setStop] = useState<Stop>();
  const [last, setLast] = useState<{
    language: PlaygroundLanguage;
    problems: number;
  }>();
  const stopped = stop && stop.language === language ? stop.kind : undefined;
  const fits = withinCheckLimits(files);
  const key = (value: string | undefined) => [
    'playground-check',
    roomKey,
    language,
    value,
  ];
  // An edit aborts the check in flight; 1.5 s of quiet settles the next one.
  useEffect(() => {
    if (!remote) return;
    if (settledHash.current !== hash)
      void client.cancelQueries({
        queryKey: ['playground-check', roomKey],
        exact: false,
      });
    const timer = setTimeout(() => {
      if (settledHash.current !== hash)
        setSettled({ hash, files: latest.current });
      else if (
        client.getQueryState(['playground-check', roomKey, language, hash])
          ?.status !== 'success'
      )
        void client.refetchQueries({
          queryKey: ['playground-check', roomKey, language, hash],
        });
    }, checkIdleMs(language));
    return () => clearTimeout(timer);
  }, [client, remote, roomKey, language, hash]);
  // Problems belong to this room and language; leaving either clears them.
  useEffect(() => () => sink.clear(roomKey), [sink, roomKey, language]);
  // Files over the limits are never checked, so problems from a smaller version are stale.
  const oversized = remote && !fits && stopped !== 'unsupported';
  useEffect(() => {
    if (oversized) sink.clear(roomKey);
  }, [sink, roomKey, oversized]);
  const query = useQuery({
    queryKey: key(settled?.hash),
    enabled:
      remote &&
      visible &&
      fits &&
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
      let warming = 0;
      let busy = 0;
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
          setLast({
            language: checkedLanguage,
            problems: result.diagnostics.length,
          });
          return result.diagnostics.length;
        } catch (error) {
          const refusal = checkRefusal(error);
          if (refusal.kind === 'warming' && warming < CHECK_WARMING_RETRIES) {
            warming += 1;
            await sleep(refusal.retryAfterSeconds * 1000, signal);
            continue;
          }
          if (refusal.kind === 'busy' && busy < CHECK_BUSY_RETRIES) {
            busy += 1;
            await sleep(refusal.retryAfterSeconds * 1000, signal);
            continue;
          }
          if (refusal.kind === 'conflict' && !conflicted) {
            conflicted = true;
            continue;
          }
          if (refusal.kind === 'warming' || refusal.kind === 'unavailable')
            setStop({ language: checkedLanguage, kind: 'unavailable' });
          else if (refusal.kind === 'unsupported') {
            sink.clear(roomKey);
            setStop({ language: checkedLanguage, kind: 'unsupported' });
          } else if (refusal.kind === 'quota') {
            const pause: Stop = { language: checkedLanguage, kind: 'quota' };
            setStop(pause);
            setTimeout(
              () => setStop((value) => (value === pause ? undefined : value)),
              refusal.retryAfterSeconds * 1000
            );
          }
          // A superseded, aborted or failed check keeps the last problems.
          throw error;
        }
      }
    },
  });
  if (!remote || stopped === 'unsupported') return { kind: 'off' };
  if (!fits) return { kind: 'tooLarge' };
  if (stopped) return { kind: 'paused' };
  if (query.isFetching) return { kind: 'checking' };
  return last?.language === language
    ? { kind: 'ready', problems: last.problems }
    : { kind: 'off' };
}
