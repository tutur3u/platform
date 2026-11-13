import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ access: vi.fn() }));
vi.mock('@/lib/external-projects/access', () => ({
  requireWorkspaceExternalProjectAccess: (...args: unknown[]) =>
    mocks.access(...args),
}));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: vi.fn(async () => undefined),
}));

const WS = '00000000-0000-4000-8000-0000000000aa';
const ENTRY = '00000000-0000-4000-8000-000000000001';
const VERSION = '00000000-0000-4000-8000-000000000002';

type Result = {
  data: unknown;
  error: { code?: string; message: string } | null;
};

// Records every query call and resolves with the next queued result.
function fakeAdmin(results: Result[]) {
  const calls: unknown[][] = [];
  const next = () => Promise.resolve(results.shift());
  const query: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'order', 'insert'])
    query[method] = (...args: unknown[]) => {
      calls.push([method, ...args]);
      return query;
    };
  query.single = next;
  query.maybeSingle = next;
  // A list ends with limit(), so it resolves the query.
  query.limit = (...args: unknown[]) => {
    calls.push(['limit', ...args]);
    return next();
  };
  return {
    calls,
    client: {
      from: (table: string) => {
        calls.push(['from', table]);
        return query;
      },
      rpc: (name: string, args: unknown) => {
        calls.push(['rpc', name, args]);
        return next();
      },
    },
  };
}

function allow(admin: unknown) {
  mocks.access.mockResolvedValue({
    admin,
    normalizedWorkspaceId: WS,
    ok: true,
    user: { id: 'user-1' },
  });
}

const context = (versionId?: string) => ({
  params: Promise.resolve({ entryId: ENTRY, versionId, wsId: 'ieeai' }),
});
const post = (body: unknown) =>
  new Request('http://localhost/x', {
    body: JSON.stringify(body),
    method: 'POST',
  });

const collection = () => import('./route');
const publish = () => import('./[versionId]/publish/route');

describe('CMS page version routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists versions of the entry in the caller workspace with edit access', async () => {
    const admin = fakeAdmin([{ data: [{ id: VERSION }], error: null }]);
    allow(admin.client);
    const response = await (
      await collection()
    ).GET(new Request('http://localhost/x'), context());
