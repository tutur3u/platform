import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authorize = vi.fn();
const publish = vi.fn();
const list = vi.fn();
vi.mock('@/lib/devboxes/authorization', () => ({
  authorizeDevboxRootMember: (request: Request) => authorize(request),
}));
vi.mock('@/lib/balancer/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/balancer/store')>();
  return {
    ...actual,
    listBalancerRuns: () => list(),
    publishBalancerRuns: (publisher: string, runs: unknown[]) =>
      publish(publisher, runs),
  };
});
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: async () => undefined,
}));

const { GET, POST } = await import('./route');

const sha = '10e51a7e78890288e1fa99d0ab83f804b6dfe2dd';
const run = (patch: Record<string, unknown> = {}) => ({
  runId: 'proof-plan-test-20261025-b-r1',
  requestId: 'proof-plan-test-20261025-b',
  replica: 1,
  revision: 6,
  state: 'succeeded',
  purpose: 'test',
  source: { repo: 'tutur3u/platform', baseSha: sha },
  sourceId: 'a'.repeat(64),
  command: ['bun', 'x', 'vitest', 'run'],
  cwd: 'packages/sdk',
  priority: 6,
  requester: { kind: 't3-thread', threadId: 'thread-1' },
  deviceId: 'linux',
  lease: {
    leaseId: 'a5fbbe1b-9f31-4c0a-8fe0-5a7c18f91559',
    fence: 1,
    runId: 'proof-plan-test-20261025-b-r1',
    deviceId: 'linux',
    issuedAt: '2026-10-25T05:25:00.000Z',
  },
  result: {
    resultId: 'a5fbbe1b-9f31-4c0a-8fe0-5a7c18f91559',
    runId: 'proof-plan-test-20261025-b-r1',
    fence: 1,
    status: 'succeeded',
    exitCode: 0,
    phase: 'command',
    finishedAt: '2026-10-25T05:25:31.399Z',
    logSha256: 'b'.repeat(64),
  },
  history: [{ at: '2026-10-25T05:25:00.000Z', from: null, to: 'queued' }],
  consumedBy: [],
  queuedAt: '2026-10-25T05:24:59.000Z',
  ...patch,
});
const post = (body: unknown) =>
  POST(
    new Request('https://infra.test/api/v1/infrastructure/balancer/runs', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  );

beforeEach(() => {
  authorize.mockReset();
  publish.mockReset();
  list.mockReset();
  authorize.mockResolvedValue({ ok: true, user: { id: 'user-1' } });
  publish.mockResolvedValue([{ runId: 'x', applied: true }]);
});

describe('balancer runs route', () => {
  it('refuses callers who are not root members', async () => {
    authorize.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ message: 'Forbidden' }, { status: 403 }),
    });
    expect((await post({ runs: [run()] })).status).toBe(403);
    expect((await GET(new Request('https://infra.test'))).status).toBe(403);
    expect(publish).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
  });

  it('publishes valid runs as the authenticated user only', async () => {
    const response = await post({ runs: [run()] });
    expect(response.status).toBe(200);
    expect(publish).toHaveBeenCalledWith('user-1', [
      expect.objectContaining({ runId: 'proof-plan-test-20261025-b-r1' }),
    ]);
  });

  it.each([
    ['an unknown state', { state: 'done' }],
    ['a short SHA', { source: { repo: 'tutur3u/platform', baseSha: 'abc' } }],
    ['a traversal run ID', { runId: '../../etc-r1' }],
    [
      'an oversized command',
      { command: Array.from({ length: 300 }, () => 'x') },
    ],
  ])('rejects %s', async (_label, patch) => {
    expect((await post({ runs: [run(patch)] })).status).toBe(400);
    expect(publish).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON and empty batches', async () => {
    expect((await post('{')).status).toBe(400);
    expect((await post({ runs: [] })).status).toBe(400);
  });
});
