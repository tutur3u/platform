import { meetRealtimeTokenPayloadSchema } from '@tuturuuu/realtime/meet';
import {
  pollDefinitionSchema,
  type PollResults,
  type PollsView,
} from '@tuturuuu/realtime/meet/room-polls';
import { z } from 'zod';
import { signMeetRealtimeToken } from '@tuturuuu/realtime/meet/token';
import type { LiveSessionClaims } from '../../features/live-assistant/contracts';
import type { LiveEnvironment } from './storage';

export type LiveRoomIdentity = {
  workspaceId: string;
  isHost: boolean;
  displayName: string;
};
export async function liveRoomCommand<T>(
  env: LiveEnvironment,
  claims: LiveSessionClaims,
  identity: LiveRoomIdentity,
  command: unknown,
  signal?: AbortSignal
): Promise<T> {
  const token = signMeetRealtimeToken(
    meetRealtimeTokenPayloadSchema.parse({
      admission: 'open',
      displayName: identity.displayName,
      exp: Math.floor(Date.now() / 1000) + 60,
      limits: {},
      meetingId: claims.meetingId,
      mode: 'call',
      role: identity.isHost ? 'host' : 'speaker',
      roomId: `${identity.workspaceId}:${claims.meetingId}`,
      scopes: ['meet:server', 'meet:live-server'],
      userId: claims.ownerId,
      accountId: claims.ownerId,
      wsId: identity.workspaceId,
    }),
    env.MEET_REALTIME_TOKEN_SECRET
  );
  const url = new URL(env.MEET_REALTIME_URL);
  url.protocol =
    url.protocol === 'ws:' || url.protocol === 'http:' ? 'http:' : 'https:';
  url.pathname = '/room-service';
  url.search = '';
  const response = await fetch(url, {
    method: 'POST',
    // workerd does not support redirect: 'error'. Never forward this token
    // to a redirect target; the non-2xx check below rejects redirects.
    redirect: 'manual',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(8000)])
      : AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`live_room_${response.status}`);
  return (await response.json()) as T;
}

export type LivePollTool = 'draft_poll' | 'launch_poll' | 'summarize_poll';

export async function livePollCommand(
  env: LiveEnvironment,
  claims: LiveSessionClaims,
  identity: LiveRoomIdentity,
  name: LivePollTool,
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (
    !identity.isHost ||
    claims.mode !== 'personal' ||
    claims.app === 'parley' ||
    claims.expiresAt <= Date.now()
  )
    return { error: 'Only the meeting host can manage polls in Private Mira' };

  if (name === 'draft_poll') {
    const { anonymous, ...input } = args;
    const definition = pollDefinitionSchema.safeParse(input);
    if (typeof anonymous !== 'boolean' || !definition.success)
      return { error: 'Invalid poll definition' };
    return liveRoomCommand(env, claims, identity, {
      action: 'poll.create',
      definition: definition.data,
      anonymous,
    });
  }

  const parsed = z
    .strictObject({ pollId: z.uuid().optional() })
    .safeParse(args);
  if (!parsed.success) return { error: 'Invalid poll ID' };
  let { pollId } = parsed.data;
  if (!pollId) {
    const { polls } = await liveRoomCommand<PollsView>(env, claims, identity, {
      action: 'poll.list',
    });
    const candidates = polls
      .filter((poll) =>
        name === 'launch_poll'
          ? poll.status === 'draft'
          : poll.status !== 'draft'
      )
      .map(({ id, question, status }) => ({ id, question, status }));
    if (candidates.length !== 1) return { candidates, needsSelection: true };
    pollId = candidates[0]?.id;
  }
  if (name === 'launch_poll')
    return liveRoomCommand(env, claims, identity, {
      action: 'poll.launch',
      pollId,
    });

  const { question, results } = await liveRoomCommand<{
    question: string;
    results: PollResults;
  }>(env, claims, identity, { action: 'poll.summary', pollId });
  return {
    question,
    results: {
      responseCount: results.responseCount,
      average: results.average,
      tally: results.tally.slice(0, 30),
      answers: results.answers
        ?.slice(0, 20)
        .map((answer) => answer.slice(0, 160)),
    },
  };
}
