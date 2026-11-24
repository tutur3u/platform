import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  segments: vi.fn(),
  coverage: vi.fn(),
  attempt: vi.fn(),
  payer: vi.fn(),
  credits: vi.fn(),
  generate: vi.fn(),
  limiter: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: vi.fn() }));
vi.mock('@tuturuuu/satellite/auth', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({}));
vi.mock('@tuturuuu/ai/meetings/gemini', () => ({}));
vi.mock('./self-v1-reads', async (original) => ({
  ...(await original<object>()),
  listSelfSegments: mocks.segments,
  listSelfCoverage: mocks.coverage,
  readSelfRoster: async () => new Map([['a', 'Ana']]),
}));
vi.mock('./self-v1-rpc', async (original) => ({
  ...(await original<object>()),
  selfRpc: { noteAttempt: mocks.attempt },
}));
vi.mock('./transcript-authority', () => ({
  requireMeetTranscriptPayer: mocks.payer,
}));
vi.mock('./credit-admission', () => ({ admitMeetCredits: mocks.credits }));
vi.mock('./artifact-billing', () => ({
  generateBilledMeetArtifact: mocks.generate,
}));
vi.mock('./usage-limit', () => ({ enforceMeetAiUsage: mocks.limiter }));

import { MeetSelfRpcError } from './self-v1-rpc';
import { generateSelfNotes } from './self-v1-notes';

const order: string[] = [];
function db() {
  const updates: unknown[] = [];
  const chain: Record<string, unknown> = {};
  chain.update = vi.fn((payload) => {
    updates.push(payload);
    return chain;
  });
  for (const key of ['eq', 'in', 'select']) chain[key] = vi.fn(() => chain);
  chain.maybeSingle = vi.fn().mockResolvedValue({ data: { id: 's' } });
  return { client: { from: () => chain } as never, updates };
}
const session = {
  id: 's',
  user_id: 'host',
  billing_host_id: 'host',
  billing_ws_id: 'w',
  notes_status: 'pending',
};
const run = (client: never, row: Record<string, unknown> = session) =>
  generateSelfNotes({
    db: client,
    session: row as never,
    meetingId: 'm',
    meetingStartedAt: 't',
  });

beforeEach(() => {
  vi.resetAllMocks();
  order.length = 0;
  mocks.segments.mockResolvedValue([
    { account_id: 'a', start_ms: 1000, transcript: 'hello' },
  ]);
  mocks.coverage.mockResolvedValue([{ account_id: 'a', coverage: 'contributing' }]);
  mocks.payer.mockImplementation(async () => {
    order.push('payer');
    return { billingWorkspaceId: 'root' };
  });
  mocks.credits.mockResolvedValue({});
  mocks.attempt.mockImplementation(async () => {
    order.push('attempt');
    return 1;
  });
  mocks.generate.mockImplementation(async () => {
    order.push('provider');
    return {
      notes: {
        summary: 's',
        decisions: [],
        actionItems: [],
        openQuestions: [],
      },
      usage: {},
      costUsd: 0.01,
    };
  });
});

describe('self_v1 notes', () => {
  it('uses only segments, the host payer and a counted attempt before dispatch', async () => {
    const { client, updates } = db();
    await run(client);
    expect(order).toEqual(['payer', 'attempt', 'provider']);
    expect(mocks.payer).toHaveBeenCalledWith({
      userId: 'host',
      wsId: 'w',
      meetingId: 'm',
    });
    expect(mocks.segments).toHaveBeenCalledWith(client, 's', 'host');
    const prompt = mocks.generate.mock.calls[0]?.[0].transcript as string;
    expect(prompt).toContain('"accountId":"a"');
    expect(prompt).toContain('hello');
    expect(mocks.generate.mock.calls[0]?.[1]).toMatchObject({
      userId: 'host',
      attemptId: 's:notes:1',
    });
    expect(updates.at(-1)).toMatchObject({
      notes_status: 'completed',
      notes: expect.objectContaining({ incomplete: false }),
    });
  });

  it('marks partial coverage without naming anyone', async () => {
    mocks.coverage.mockResolvedValue([
      { account_id: 'a', coverage: 'contributing' },
      { account_id: 'b', coverage: 'not_contributing' },
    ]);
    const { client, updates } = db();
    await run(client);
    const prompt = mocks.generate.mock.calls[0]?.[0].transcript as string;
    expect(prompt).not.toContain('"b"');
    expect(updates.at(-1)).toMatchObject({
      notes: expect.objectContaining({ incomplete: true }),
    });
  });

  it('starts no provider call once the attempt budget is spent', async () => {
    mocks.attempt.mockRejectedValue(new MeetSelfRpcError(409, 'cap', '54000'));
    const { client, updates } = db();
    await expect(run(client)).rejects.toMatchObject({ status: 409 });
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(updates.at(-1)).toMatchObject({ notes_status: 'failed' });
  });

  it('refuses a session with a null host or payer', async () => {
    const { client } = db();
    await expect(
      run(client, { ...session, billing_host_id: null })
    ).rejects.toMatchObject({ status: 409 });
    expect(mocks.limiter).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it('bills nothing when no one spoke', async () => {
    mocks.segments.mockResolvedValue([]);
    const { client } = db();
    await run(client);
    expect(mocks.payer).not.toHaveBeenCalled();
    expect(mocks.attempt).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});
