import { afterEach, expect, it, vi } from 'vitest';
import { liveSessionClaimsSchema } from '../../features/live-assistant/contracts';
import { liveQuizArenaCommand } from './quiz-arena';
import { liveTools } from './tools';

const id = 'efaa0c45-4f33-4c6c-9bc8-ae4e65e2b740';
const tileId = '9987d372-ee63-4228-8b17-3757ca5d1ccf';
const claims = liveSessionClaimsSchema.parse({
  audience: 'meet-live',
  app: 'meet',
  billingWorkspaceId: id,
  sessionId: id,
  meetingId: id,
  ownerId: id,
  mode: 'personal',
  expiresAt: Date.now() + 60_000,
});
const identity = { isHost: true, workspaceId: id, displayName: 'Host' };
const env = {
  MEET_REALTIME_TOKEN_SECRET: 'synthetic-test-token-secret',
  MEET_REALTIME_URL: 'wss://fake-realtime.test',
} as Parameters<typeof liveQuizArenaCommand>[0];
const draft = {
  subject: 'history',
  grade: '8',
  topic: 'Ancient trade routes',
  answerMode: 'buzz_in',
  playMode: 'teams',
};
const transport = vi.fn();
const bodies = () =>
  transport.mock.calls.map((call) => JSON.parse(String(call[1].body)));

afterEach(() => {
  vi.unstubAllGlobals();
  transport.mockReset();
});

it('declares host Quiz Arena tools only for Private Mira and gates them before transport', async () => {
  const names = ['draft_quiz_arena', 'pick_quiz_arena_tile'];
  expect(liveTools('personal', false).map(({ name }) => name)).toEqual(
    expect.arrayContaining(names)
  );
  expect(
    liveTools('room', false).some(({ name }) => name && names.includes(name))
  ).toBe(false);
  vi.stubGlobal('fetch', transport);
  for (const request of [
    liveQuizArenaCommand(
      env,
      claims,
      { ...identity, isHost: false },
      'draft_quiz_arena',
      draft
    ),
    liveQuizArenaCommand(
      env,
      { ...claims, app: 'parley' },
      identity,
      'draft_quiz_arena',
      draft
    ),
    liveQuizArenaCommand(
      env,
      { ...claims, mode: 'room' },
      identity,
      'pick_quiz_arena_tile',
      { categoryIndex: 0, tierIndex: 0 }
    ),
  ])
    await expect(request).resolves.toHaveProperty('error');
  expect(transport).not.toHaveBeenCalled();
});

it('drafts a starter board, or Mira’s own questions when they validate', async () => {
  vi.stubGlobal('fetch', transport);
  transport.mockImplementation(async () => Response.json({ ok: true, seq: 1 }));
  await expect(
    liveQuizArenaCommand(env, claims, identity, 'draft_quiz_arena', draft)
  ).resolves.toMatchObject({ ok: true, generated: false, tiles: 25 });
  expect(bodies()[0]).toMatchObject({
    action: 'arena.setup',
    board: { source: 'starter' },
    config: { answerMode: 'buzz_in', playMode: 'teams' },
  });
  const categories = ['Silk Road', 'Spice trade', 'Ports'].map((name) => ({
    name,
    questions: [0, 1, 2].map((n) => ({
      question: `${name} question ${n}?`,
      options: ['Yes', 'No'],
      correctIndex: 0,
    })),
  }));
  await expect(
    liveQuizArenaCommand(env, claims, identity, 'draft_quiz_arena', {
      ...draft,
      categories,
    })
  ).resolves.toMatchObject({ generated: true, tiles: 9 });
  expect(bodies()[1].board).toMatchObject({
    source: 'mira',
    categories: ['Silk Road', 'Spice trade', 'Ports'],
  });
});

it('picks only an available tile at the requested position, marked as Mira’s pick', async () => {
  vi.stubGlobal('fetch', transport);
  transport.mockImplementation(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    if (body.action !== 'arena.state') return Response.json({ ok: true });
    return Response.json({
      kind: 'full',
      meta: { categories: ['Recursion'] },
      tiles: [
        {
          id: tileId,
          categoryIndex: 0,
          tierIndex: 1,
          points: 200,
          status: 'available',
        },
        {
          id: id,
          categoryIndex: 0,
          tierIndex: 0,
          points: 100,
          status: 'revealed',
        },
      ],
    });
  });
  await expect(
    liveQuizArenaCommand(env, claims, identity, 'pick_quiz_arena_tile', {
      categoryIndex: 0,
      tierIndex: 0,
    })
  ).resolves.toEqual({ error: 'That tile is not available' });
  await expect(
    liveQuizArenaCommand(env, claims, identity, 'pick_quiz_arena_tile', {
      categoryIndex: 0,
      tierIndex: 1,
    })
  ).resolves.toEqual({ ok: true, category: 'Recursion', points: 200 });
  expect(bodies().at(-1)).toEqual({
    action: 'arena.pickTile',
    tileId,
    source: 'mira',
  });
  await expect(
    liveQuizArenaCommand(env, claims, identity, 'pick_quiz_arena_tile', {
      categoryIndex: 0,
      tierIndex: 0,
      force: true,
    })
  ).resolves.toEqual({ error: 'Invalid tile position' });
});
