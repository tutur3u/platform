import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { liveSessionClaimsSchema } from '../../features/live-assistant/contracts';
import { executeLiveDecision } from './decision';
import { applyQuizArenaProposal, proposeQuizArenaAction } from './quiz-arena';
import type { LiveProposal } from './reviews';
import type { SavedSession } from './session-state';
import { executeLiveTool } from './session-tools';
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
  inputSource: 'private-microphone',
  consentVersion: 'v1',
  consentRevision: 1,
  workspaceAuthority: 'verified-personal',
  expiresAt: Date.now() + 60_000,
});
const identity = { isHost: true, workspaceId: id, displayName: 'Host' };
const env = {
  MEET_AI_DISABLED: 'false',
  MEET_REALTIME_TOKEN_SECRET: 'synthetic-test-token-secret',
  MEET_REALTIME_URL: 'wss://fake-realtime.test',
} as unknown as Parameters<typeof proposeQuizArenaAction>[0];
const draft = {
  subject: 'history',
  grade: '8',
  topic: 'Ancient trade routes',
  answerMode: 'buzz_in',
  playMode: 'teams',
};
const board = (epoch = 'epoch-1', status = 'available') => ({
  kind: 'full',
  epoch,
  meta: { categories: ['Recursion'], phase: 'board' },
  tiles: [
    { id: tileId, categoryIndex: 0, tierIndex: 1, points: 200, status },
    { id, categoryIndex: 0, tierIndex: 0, points: 100, status: 'revealed' },
  ],
});
let arena: unknown = board();
const transport = vi.fn();
const commands = () =>
  transport.mock.calls.map((call) => JSON.parse(String(call[1].body)));
const writes = () =>
  commands().filter(
    ({ action }) => action !== 'arena.state' && action !== 'mira.private.read'
  );

beforeEach(() => {
  arena = board();
  vi.stubGlobal('fetch', transport);
  transport.mockImplementation(async (_url: string, init: RequestInit) => {
    const { action } = JSON.parse(String(init.body));
    if (action === 'arena.state') return Response.json(arena);
    if (action === 'mira.private.read')
      return Response.json({
        choice: {
          choice: 'continue',
          accountId: id,
          meetingId: id,
          version: 'v1',
          revision: 1,
        },
      });
    return Response.json({ ok: true, seq: 9 });
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  transport.mockReset();
});

function session(): SavedSession {
  return {
    claims,
    identity,
    reviews: [],
    toolResponses: [],
  } as unknown as SavedSession;
}

it('declares Quiz Arena tools only for Private Mira and gates them before transport', async () => {
  const names = ['draft_quiz_arena', 'pick_quiz_arena_tile'];
  expect(liveTools('personal', false).map(({ name }) => name)).toEqual(
    expect.arrayContaining(names)
  );
  expect(
    liveTools('room', false).some(({ name }) => name && names.includes(name))
  ).toBe(false);
  for (const request of [
    proposeQuizArenaAction(
      env,
      claims,
      { ...identity, isHost: false },
      'draft_quiz_arena',
      draft
    ),
    proposeQuizArenaAction(
      env,
      { ...claims, app: 'parley' },
      identity,
      'draft_quiz_arena',
      draft
    ),
    proposeQuizArenaAction(
      env,
      { ...claims, mode: 'room' },
      identity,
      'pick_quiz_arena_tile',
      { categoryIndex: 0, tierIndex: 1 }
    ),
  ])
    await expect(request).resolves.toHaveProperty('error');
  expect(transport).not.toHaveBeenCalled();
});

it('turns a tool call into a pending host review without changing the room', async () => {
  const saved = session();
  const provider = { sendToolResponse: vi.fn() };
  const emitReview = vi.fn();
  for (const [name, args] of [
    ['pick_quiz_arena_tile', { categoryIndex: 0, tierIndex: 1 }],
    ['draft_quiz_arena', draft],
  ] as const) {
    saved.reviews = [];
    await executeLiveTool(
      {
        saved,
        provider: provider as never,
        env,
        archive: {} as never,
        persist: async () => {},
        emit: () => {},
        emitReview,
      },
      `call-${name}`,
      name,
      { ...args }
    );
    expect(saved.reviews).toHaveLength(1);
    expect(saved.reviews[0]).toMatchObject({
      name: 'quiz_arena',
      toolName: name,
      status: 'pending',
    });
  }
  expect(emitReview).toHaveBeenCalledTimes(2);
  expect(provider.sendToolResponse).not.toHaveBeenCalled();
  expect(writes()).toEqual([]);
});

it('writes only the exact approved action, and nothing when the host denies it', async () => {
  const proposal = await proposeQuizArenaAction(
    env,
    claims,
    identity,
    'pick_quiz_arena_tile',
    { categoryIndex: 0, tierIndex: 1 }
  );
  if ('error' in proposal) throw new Error(proposal.error);
  expect(proposal.args).toEqual({ kind: 'pick', tileId, epoch: 'epoch-1' });
  const review = (): LiveProposal => ({
    id,
    callId: 'call',
    name: 'quiz_arena',
    toolName: 'pick_quiz_arena_tile',
    args: proposal.args,
    text: proposal.text,
    status: 'processing',
    expiresAt: Date.now() + 60_000,
  });
  const decide = (item: LiveProposal, approved: boolean) =>
    executeLiveDecision(
      session(),
      env,
      item,
      approved,
      new AbortController().signal,
      () => undefined,
      async () => {},
      async () => {}
    );
  const denied = review();
  await decide(denied, false);
  expect(denied.status).toBe('denied');
  expect(writes()).toEqual([]);
  const approved = review();
  await decide(approved, true);
  expect(approved.status).toBe('approved');
  expect(writes()).toEqual([
    { action: 'arena.pickTile', tileId, source: 'mira' },
  ]);
});

it('fails an approval whose board or tile changed since the proposal', async () => {
  const pick = { kind: 'pick', tileId, epoch: 'epoch-1' };
  arena = board('epoch-2');
  await expect(
    applyQuizArenaProposal(env, claims, identity, pick)
  ).rejects.toThrow('quiz_arena_board_changed');
  arena = board('epoch-1', 'revealed');
  await expect(
    applyQuizArenaProposal(env, claims, identity, pick)
  ).rejects.toThrow('quiz_arena_tile_taken');
  await expect(
    applyQuizArenaProposal(env, claims, { ...identity, isHost: false }, pick)
  ).rejects.toThrow();
  expect(writes()).toEqual([]);
});

it('proposes a starter board, or Mira’s own validated questions, for approval', async () => {
  arena = { kind: 'empty', canManage: true };
  const starter = await proposeQuizArenaAction(
    env,
    claims,
    identity,
    'draft_quiz_arena',
    draft
  );
  expect(starter).toMatchObject({
    args: {
      kind: 'setup',
      epoch: null,
      board: { source: 'starter' },
      config: { answerMode: 'buzz_in', playMode: 'teams' },
    },
  });
  const categories = ['Silk Road', 'Spice trade', 'Ports'].map((name) => ({
    name,
    questions: [0, 1, 2].map((n) => ({
      question: `${name} question ${n}?`,
      options: ['Yes', 'No'],
      correctIndex: 0,
    })),
  }));
  const generated = await proposeQuizArenaAction(
    env,
    claims,
    identity,
    'draft_quiz_arena',
    { ...draft, categories }
  );
  if ('error' in generated) throw new Error(generated.error);
  expect(generated.args).toMatchObject({
    board: {
      source: 'mira',
      categories: ['Silk Road', 'Spice trade', 'Ports'],
    },
  });
  expect(writes()).toEqual([]);
  await applyQuizArenaProposal(env, claims, identity, generated.args);
  expect(writes()).toMatchObject([
    { action: 'arena.setup', board: { source: 'mira' } },
  ]);
});
