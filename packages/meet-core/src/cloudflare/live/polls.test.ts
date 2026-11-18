import { afterEach, expect, it, vi } from 'vitest';
import { liveSessionClaimsSchema } from '../../features/live-assistant/contracts';
import { livePollCommand } from './room';
import { liveTools } from './tools';

const pollId = 'efaa0c45-4f33-4c6c-9bc8-ae4e65e2b740';
const claims = liveSessionClaimsSchema.parse({
  audience: 'meet-live',
  app: 'meet',
  billingWorkspaceId: pollId,
  sessionId: pollId,
  meetingId: pollId,
  ownerId: pollId,
  mode: 'personal',
  expiresAt: Date.now() + 60_000,
});
const identity = { isHost: true, workspaceId: pollId, displayName: 'Host' };
const env = {
  MEET_REALTIME_TOKEN_SECRET: 'synthetic-test-token-secret',
  MEET_REALTIME_URL: 'wss://fake-realtime.test',
} as Parameters<typeof livePollCommand>[0];
const draft = {
  type: 'rating',
  question: 'How was it?',
  min: 1,
  max: 5,
  anonymous: true,
};
const transport = vi.fn();
const roomBody = () =>
  JSON.parse(String(transport.mock.calls.at(-1)?.[1].body));

afterEach(() => {
  vi.unstubAllGlobals();
  transport.mockReset();
});

it('declares poll tools for Private Mira and gates calls before transport', async () => {
  const names = ['draft_poll', 'launch_poll', 'summarize_poll'];
  expect(liveTools('personal', false).map(({ name }) => name)).toEqual(
    expect.arrayContaining(names)
  );
  expect(
    liveTools('room', false).some(({ name }) => name && names.includes(name))
  ).toBe(false);
  vi.stubGlobal('fetch', transport);
  for (const request of [
    livePollCommand(
      env,
      claims,
      { ...identity, isHost: false },
      'draft_poll',
      draft
    ),
    livePollCommand(
      env,
      { ...claims, app: 'parley' },
      identity,
      'draft_poll',
      draft
    ),
    livePollCommand(
      env,
      { ...claims, mode: 'room' },
      identity,
      'draft_poll',
      draft
    ),
    livePollCommand(env, claims, identity, 'draft_poll', { ...draft, max: 7 }),
  ])
    expect(await request).toHaveProperty('error');
  expect(transport).not.toHaveBeenCalled();
});

it('drafts without launching, lists ambiguous candidates and launches the selected UUID', async () => {
  vi.stubGlobal('fetch', transport);
  transport
    .mockResolvedValueOnce(Response.json({ pollId }))
    .mockResolvedValueOnce(
      Response.json({
        polls: [
          { id: pollId, question: 'First', status: 'draft' },
          { id: claims.meetingId, question: 'Second', status: 'draft' },
        ],
      })
    )
    .mockResolvedValueOnce(Response.json({ ok: true }));
  await expect(
    livePollCommand(env, claims, identity, 'draft_poll', draft)
  ).resolves.toEqual({ pollId });
  expect(roomBody()).toEqual({
    action: 'poll.create',
    definition: { type: 'rating', question: 'How was it?', min: 1, max: 5 },
    anonymous: true,
  });
  await expect(
    livePollCommand(env, claims, identity, 'launch_poll', {})
  ).resolves.toMatchObject({ needsSelection: true });
  expect(roomBody()).toEqual({ action: 'poll.list' });
  await expect(
    livePollCommand(env, claims, identity, 'launch_poll', { pollId })
  ).resolves.toEqual({ ok: true });
  expect(roomBody()).toEqual({ action: 'poll.launch', pollId });
});

it('summarizes projected data only and respects the room-service result', async () => {
  vi.stubGlobal('fetch', transport);
  transport
    .mockResolvedValueOnce(
      Response.json({
        question: 'Which?',
        results: {
          responseCount: 1,
          tally: [{ label: 'A', count: 1 }],
          userId: 'private',
        },
      })
    )
    .mockResolvedValueOnce(new Response(null, { status: 403 }));
  const result = await livePollCommand(
    env,
    claims,
    identity,
    'summarize_poll',
    { pollId }
  );
  expect(roomBody()).toEqual({ action: 'poll.summary', pollId });
  expect(result).toMatchObject({
    question: 'Which?',
    results: { responseCount: 1, tally: [{ label: 'A', count: 1 }] },
  });
  expect(JSON.stringify(result)).not.toContain('private');
  await expect(
    livePollCommand(env, claims, identity, 'launch_poll', { pollId })
  ).rejects.toThrow('live_room_403');
});
