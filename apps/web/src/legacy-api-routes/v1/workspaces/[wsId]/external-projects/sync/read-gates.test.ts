import { expect, it, vi } from 'vitest';

const access = vi.hoisted(() =>
  vi.fn(async (_input: unknown) => ({
    ok: false,
    response: new Response(null, { status: 403 }),
  }))
);
vi.mock('@/lib/external-projects/access', () => ({
  requireWorkspaceExternalProjectAccess: access,
}));
vi.mock('@/lib/external-projects/sync', () => ({
  getWorkspaceExternalProjectSyncSnapshot: vi.fn(),
  buildExternalProjectSyncDiff: vi.fn(),
}));
vi.mock('@/lib/infrastructure/log-drain', () => ({
  withRequestLogDrain: (_context: unknown, run: () => unknown) => run(),
}));
vi.mock('./shared', () => ({
  readSyncManifestRequest: vi.fn(),
  SyncManifestRequestBodyError: class extends Error {},
}));

import { POST } from './diff/route';
import { GET } from './snapshot/route';

it('denies editor sync reads unless the publish gate succeeds', async () => {
  const context = { params: Promise.resolve({ wsId: 'workspace' }) };
  expect(
    (await GET(new Request('https://example.com/sync') as never, context))
      .status
  ).toBe(403);
  expect(
    (
      await POST(
        new Request('https://example.com/sync', { method: 'POST' }) as never,
        context
      )
    ).status
  ).toBe(403);
  expect(access).toHaveBeenCalledTimes(2);
  for (const call of access.mock.calls)
    expect(call[0]).toMatchObject({ mode: 'publish' });
});
