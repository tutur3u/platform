'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  encodePathSegment,
  getInternalApiClient,
  resolveOwnAppApiPath,
} from '@tuturuuu/internal-api/client';
import type {
  PollsView,
  ProjectedPoll,
} from '@tuturuuu/realtime/meet/room-polls';
import { useEffect } from 'react';
import type { PollAction } from '../server/polls';

const pollsPath = (meetingId: string) =>
  `/api/meet-call/${encodePathSegment(meetingId)}/polls`;

export function pollExportUrl(
  meetingId: string,
  pollId: string,
  format: 'csv' | 'json'
) {
  return resolveOwnAppApiPath(
    'meet',
    `${pollsPath(meetingId)}?${new URLSearchParams({ pollId, format })}`
  );
}

export type PollActionResult = {
  pollId?: string;
  fallback?: boolean;
  summary?: string | null;
  responseCount?: number;
};

export function sendPollAction(meetingId: string, action: PollAction) {
  return getInternalApiClient().json<PollActionResult>(pollsPath(meetingId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(action),
  });
}

export const pollsKey = (meetingId: string, accountId: string) =>
  ['meet-call-polls', meetingId, accountId] as const;

function openPollChannel(meetingId: string) {
  return typeof BroadcastChannel === 'undefined'
    ? undefined
    : new BroadcastChannel(`meet-call-polls:${meetingId}`);
}

export function notifyPollMutation(meetingId: string) {
  const channel = openPollChannel(meetingId);
  channel?.postMessage('changed');
  channel?.close();
}

export function useCallPolls(
  meetingId: string,
  accountId: string,
  enabled: boolean,
  open: boolean
) {
  const client = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    const channel = openPollChannel(meetingId);
    if (!channel) return;
    channel.onmessage = () => {
      void client.invalidateQueries({
        queryKey: pollsKey(meetingId, accountId),
      });
    };
    return () => channel.close();
  }, [accountId, client, enabled, meetingId]);

  return useQuery<PollsView>({
    queryKey: pollsKey(meetingId, accountId),
    queryFn: ({ signal }) =>
      getInternalApiClient().json<PollsView>(pollsPath(meetingId), { signal }),
    enabled,
    refetchInterval: (query) =>
      open ||
      query.state.data?.polls.some(
        (poll: ProjectedPoll) => poll.status === 'active'
      )
        ? 2000
        : 5000,
    retry: false,
  });
}
