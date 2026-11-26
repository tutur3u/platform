'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  encodePathSegment,
  getInternalApiClient,
  resolveOwnAppApiPath,
} from '@tuturuuu/internal-api/client';
import type { MeetRealtimeServerMessage } from '@tuturuuu/realtime/meet';
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

export type PollChangedMessage = Extract<
  MeetRealtimeServerMessage,
  { type: 'polls.changed' }
>;

type PollSubscriber = {
  accountId: string;
  client: ReturnType<typeof useQueryClient>;
  patch: (event: PollChangedMessage) => void;
};
const pollListeners = new Map<string, Set<PollSubscriber>>();
const pollRefetchTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** While the panel is open or a poll runs, signed-in views stay current. */
export const POLLS_LIVE_REFRESH_MS = 3000;
/**
 * Otherwise a new poll shows within this delay; a poll started in this
 * browser shows at once through the poll channel.
 */
export const POLLS_IDLE_REFRESH_MS = 15_000;
/** Guests rely on `polls.changed` WebSocket events with a 15 s fallback. */
export const POLLS_GUEST_REFRESH_MS = 15_000;
/** Spread WS-triggered poll refetches over 0–750 ms to avoid synchronized bursts. */
export const POLLS_WS_REFETCH_JITTER_MS = 750;

export function pollsRefreshInterval(
  open: boolean,
  hasActivePoll: boolean,
  guest = false
) {
  if (guest) return POLLS_GUEST_REFRESH_MS;
  return open || hasActivePoll ? POLLS_LIVE_REFRESH_MS : POLLS_IDLE_REFRESH_MS;
}

function forEachUniqueTarget(
  listeners: ReadonlySet<PollSubscriber>,
  run: (subscriber: PollSubscriber) => void
) {
  const seen = new Map<ReturnType<typeof useQueryClient>, Set<string>>();
  for (const subscriber of listeners) {
    let accounts = seen.get(subscriber.client);
    if (!accounts) {
      accounts = new Set();
      seen.set(subscriber.client, accounts);
    }
    if (accounts.has(subscriber.accountId)) continue;
    accounts.add(subscriber.accountId);
    run(subscriber);
  }
}

export function handleRoomPollsMessage(
  meetingId: string,
  message: MeetRealtimeServerMessage
) {
  if (message.type !== 'polls.changed') return;
  const listeners = pollListeners.get(meetingId);
  if (!listeners || listeners.size === 0) return;
  forEachUniqueTarget(listeners, (subscriber) => subscriber.patch(message));
  if (pollRefetchTimers.has(meetingId)) return;
  const delayMs = Math.floor(Math.random() * (POLLS_WS_REFETCH_JITTER_MS + 1));
  const timer = setTimeout(() => {
    pollRefetchTimers.delete(meetingId);
    const current = pollListeners.get(meetingId);
    if (!current) return;
    forEachUniqueTarget(current, ({ client, accountId }) => {
      void client.invalidateQueries({
        queryKey: pollsKey(meetingId, accountId),
      });
    });
  }, delayMs);
  pollRefetchTimers.set(meetingId, timer);
}

export function useCallPolls(
  meetingId: string,
  accountId: string,
  enabled: boolean,
  open: boolean,
  guest = false
) {
  const client = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    const key = pollsKey(meetingId, accountId);
    const subscriber: PollSubscriber = {
      accountId,
      client,
      patch: (event) => {
        client.setQueryData<PollsView>(key, (current) => {
          if (!current) return current;
          if (event.deleted) {
            const next = current.polls.filter(
              (poll) => poll.id !== event.pollId
            );
            return next.length === current.polls.length
              ? current
              : { ...current, polls: next };
          }
          let changed = false;
          const polls = current.polls.map((poll) => {
            if (poll.id !== event.pollId) return poll;
            const nextStatus = event.status ?? poll.status;
            const nextVisible = event.resultsVisible ?? poll.resultsVisible;
            const nextResults =
              !current.canManage && nextStatus !== 'closed' && !nextVisible
                ? null
                : poll.results;
            if (
              nextStatus === poll.status &&
              nextVisible === poll.resultsVisible &&
              nextResults === poll.results
            )
              return poll;
            changed = true;
            return {
              ...poll,
              status: nextStatus,
              resultsVisible: nextVisible,
              results: nextResults,
            };
          });
          return changed ? { ...current, polls } : current;
        });
      },
    };
    let listeners = pollListeners.get(meetingId);
    if (!listeners) {
      listeners = new Set();
      pollListeners.set(meetingId, listeners);
    }
    listeners.add(subscriber);
    const channel = openPollChannel(meetingId);
    if (channel) {
      channel.onmessage = () => {
        void client.invalidateQueries({ queryKey: key });
      };
    }
    return () => {
      listeners.delete(subscriber);
      if (listeners.size === 0) {
        pollListeners.delete(meetingId);
        const pending = pollRefetchTimers.get(meetingId);
        if (pending !== undefined) {
          clearTimeout(pending);
          pollRefetchTimers.delete(meetingId);
        }
      }
      channel?.close();
    };
  }, [accountId, client, enabled, meetingId]);

  return useQuery<PollsView>({
    queryKey: pollsKey(meetingId, accountId),
    queryFn: ({ signal }) =>
      getInternalApiClient().json<PollsView>(pollsPath(meetingId), { signal }),
    enabled,
    refetchInterval: (query) =>
      pollsRefreshInterval(
        open,
        Boolean(
          query.state.data?.polls.some(
            (poll: ProjectedPoll) => poll.status === 'active'
          )
        ),
        guest
      ),
    retry: false,
  });
}
