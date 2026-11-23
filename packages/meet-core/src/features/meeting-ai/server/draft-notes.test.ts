import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  enforce: vi.fn(),
  generate: vi.fn(),
  payer: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: vi.fn() }));
vi.mock('@tuturuuu/satellite/auth', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({}));
vi.mock('./usage-limit', () => ({ enforceMeetAiUsage: mocks.enforce }));
vi.mock('./artifact-billing', () => ({
  generateBilledMeetArtifact: mocks.generate,
}));
vi.mock('./credit-admission', () => ({
  admitMeetCredits: async (_user: string, _meeting: string, payer: string) => ({
    workspaceId: payer,
  }),
}));
vi.mock('./transcript-authority', () => ({
  requireMeetTranscriptPayer: mocks.payer,
}));
vi.mock('./transcript-roster', () => ({
  readTranscriptRoster: async () => new Map(),
}));

import { draftMeetAiNotes } from './draft-notes';

const id = '00000000-0000-4000-8000-000000000001';
const notes = {
  incomplete: false,
  summary: 'Agreed on the launch date.',
  decisions: ['Launch Friday'],
  actionItems: [],
  openQuestions: [],
};
const chunk = (sequence: number, transcript: string | null) => ({
  id: `c${sequence}`,
  sequence,
  start_seconds: sequence * 10,
  status: 'completed',
  transcript,
  usage: null,
  speaker: null,
});

function db(session: unknown, chunks: unknown[]) {
  const results = [
    { data: session, error: null },
    { data: chunks, error: null },
  ];
  const filters: Array<[string, unknown]> = [];
  const from = vi.fn(() => {
    const result = results.shift();
    const chain: Record<string, unknown> = {};
    for (const key of ['select', 'order', 'range']) chain[key] = () => chain;
    chain.eq = (column: string, value: unknown) => {
      filters.push([column, value]);
      return chain;
    };
    chain.maybeSingle = () => Promise.resolve(result);
    chain.then = (resolve: (value: unknown) => void) =>
      Promise.resolve(result).then(resolve);
    return chain;
  });
  return { client: { from } as never, filters };
}
const draft = (client: never) =>
  draftMeetAiNotes({
    db: client,
    meetingId: id,
    wsId: id,
    userId: id,
    sessionId: id,
    meetingStartedAt: '2026-11-23T00:00:00Z',
    timezone: 'Asia/Ho_Chi_Minh',
  });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.payer.mockResolvedValue({
    payer: 'tuturuuu',
    billingWorkspaceId: 'root',
  });
});

it('drafts live notes from completed speech, billed once per covered transcript', async () => {
  const { client, filters } = db({ id, ended_at: null }, [
    chunk(0, 'Hello team'),
    chunk(1, 'Launch is Friday'),
  ]);
  mocks.generate.mockResolvedValue({ notes });
  const result = await draft(client);
  expect(result).toMatchObject({
    sessionId: id,
    basedOnChunks: 2,
    notes: { summary: notes.summary, incomplete: true },
  });
  expect(filters).toContainEqual(['user_id', id]);
  expect(filters).toContainEqual(['status', 'completed']);
  expect(mocks.enforce).toHaveBeenCalledWith(
    expect.objectContaining({ kind: 'notes', workspaceId: id })
  );
  expect(mocks.generate).toHaveBeenCalledWith(
    expect.objectContaining({ timezone: 'Asia/Ho_Chi_Minh' }),
    { userId: id, meetingId: id, attemptId: `${id}:draft:2` },
    { workspaceId: 'root' }
  );
});

it('spends nothing when no saved speech exists yet', async () => {
  const { client } = db({ id, ended_at: null }, [chunk(0, '  ')]);
  expect(await draft(client)).toEqual({
    sessionId: id,
    basedOnChunks: 1,
    notes: null,
  });
  expect(mocks.enforce).not.toHaveBeenCalled();
  expect(mocks.generate).not.toHaveBeenCalled();
});

it('refuses an ended or foreign session before any paid work', async () => {
  for (const session of [{ id, ended_at: '2026-11-23T01:00:00Z' }, null]) {
    const { client } = db(session, [chunk(0, 'Hi')]);
    await expect(draft(client)).rejects.toMatchObject({
      status: session ? 409 : 404,
    });
  }
  expect(mocks.enforce).not.toHaveBeenCalled();
  expect(mocks.generate).not.toHaveBeenCalled();
});

it('reports a repeated draft of the same transcript as up to date', async () => {
  const { client } = db({ id, ended_at: null }, [chunk(0, 'Hi')]);
  mocks.generate.mockRejectedValue(
    Object.assign(new Error('already running'), { status: 409 })
  );
  await expect(draft(client)).rejects.toMatchObject({
    status: 409,
    message: 'Live notes are already up to date',
  });
});

it('refuses a free host before credits or the provider', async () => {
  const { client } = db({ id, ended_at: null }, [chunk(0, 'Hi')]);
  mocks.payer.mockRejectedValue(
    Object.assign(new Error('plan'), {
      status: 403,
      code: 'MEET_AI_ACCOUNT_UNAVAILABLE',
    })
  );
  await expect(draft(client)).rejects.toMatchObject({ status: 403 });
  expect(mocks.generate).not.toHaveBeenCalled();
});
