'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  encodePathSegment,
  getInternalApiClient,
  resolveOwnAppApiPath,
} from '@tuturuuu/internal-api/client';
import {
  mergeQuizArenaView,
  type QuizArenaEmptyView,
  type QuizArenaFullView,
  type QuizArenaView,
} from '@tuturuuu/realtime/meet/room-quiz-arena';
import { useEffect } from 'react';
import { subscribeArenaChanges } from './quiz-arena-announcement';
import type {
  QuizArenaAction,
  QuizArenaActionResult,
} from '../server/quiz-arena';

export type QuizArenaClientView = QuizArenaFullView | QuizArenaEmptyView;

const arenaPath = (meetingId: string) =>
  `/api/meet-call/${encodePathSegment(meetingId)}/quiz-arena`;

export function quizArenaExportUrl(meetingId: string, format: 'csv' | 'json') {
  return resolveOwnAppApiPath(
    'meet',
    `${arenaPath(meetingId)}?${new URLSearchParams({ format })}`
  );
}

export function sendQuizArenaAction(
  meetingId: string,
  action: QuizArenaAction
): Promise<QuizArenaActionResult> {
  return getInternalApiClient().json<QuizArenaActionResult>(
    arenaPath(meetingId),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(action),
    }
  );
}

export const quizArenaKey = (meetingId: string, accountId: string) =>
  ['meet-call-quiz-arena', meetingId, accountId] as const;

function openArenaChannel(meetingId: string) {
  return typeof BroadcastChannel === 'undefined'
    ? undefined
    : new BroadcastChannel(`meet-call-quiz-arena:${meetingId}`);
}

export function notifyQuizArenaMutation(meetingId: string) {
  const channel = openArenaChannel(meetingId);
  channel?.postMessage('changed');
  channel?.close();
}

/**
 * Keeps one merged full view per meeting and account. After the first full
 * read each poll asks only for changes since the last sequence; a delta that
 * cannot merge (new epoch or missing base) triggers one full read.
 */
export async function fetchQuizArenaView(
  meetingId: string,
  previous: QuizArenaClientView | undefined,
  signal?: AbortSignal
): Promise<QuizArenaClientView> {
  const client = getInternalApiClient();
  const read = (sinceSeq?: number) =>
    client.json<QuizArenaView>(
      sinceSeq === undefined
        ? arenaPath(meetingId)
        : `${arenaPath(meetingId)}?${new URLSearchParams({ sinceSeq: String(sinceSeq) })}`,
      { signal }
    );
  const next = await read(previous?.kind === 'full' ? previous.seq : undefined);
  const merged = mergeQuizArenaView(previous, next);
  if (merged) return merged;
  const full = await read();
  return (
    mergeQuizArenaView(undefined, full) ?? { kind: 'empty', canManage: false }
  );
}

export function useCallQuizArena(
  meetingId: string,
  accountId: string,
  enabled: boolean,
  open: boolean
) {
  const client = useQueryClient();
  const key = quizArenaKey(meetingId, accountId);
  useEffect(() => {
    if (!enabled) return;
    const channel = openArenaChannel(meetingId);
    const refresh = () => {
      void client.invalidateQueries({
        queryKey: quizArenaKey(meetingId, accountId),
      });
    };
    if (channel) channel.onmessage = refresh;
    const unsubscribe = subscribeArenaChanges(meetingId, refresh);
    return () => {
      unsubscribe();
      channel?.close();
    };
  }, [accountId, client, enabled, meetingId]);

  return useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      fetchQuizArenaView(
        meetingId,
        client.getQueryData<QuizArenaClientView>(key),
        signal
      ),
    enabled,
    refetchInterval: (query) =>
      open && query.state.data?.canManage ? 10_000 : 60_000,
    retry: false,
  });
}
