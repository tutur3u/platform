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
    const response = await (await collection()).GET(
      new Request('http://localhost/x'),
      context()
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ id: VERSION }]);
    expect(mocks.access).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'edit', wsId: 'ieeai' })
    );
    expect(admin.calls).toContainEqual(['eq', 'ws_id', WS]);
    expect(admin.calls).toContainEqual(['eq', 'entry_id', ENTRY]);
  });

  it('passes access denials through unchanged', async () => {
    mocks.access.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    });
    const response = await (await collection()).POST(post({}), context());
    expect(response.status).toBe(403);
    expect(mocks.access).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'edit' })
    );
  });

  it('saves a draft as the acting user in the caller workspace', async () => {
    const admin = fakeAdmin([
      { data: { id: VERSION, status: 'draft' }, error: null },
    ]);
    allow(admin.client);
    const response = await (await collection()).POST(
      post({ data: { content: [] }, note: ' first ', schemaVersion: 1 }),
      context()
    );

    expect(response.status).toBe(201);
    expect(admin.calls).toContainEqual([
      'insert',
      {
        created_by: 'user-1',
        data: { content: [] },
        entry_id: ENTRY,
        note: 'first',
        schema_version: 1,
        ws_id: WS,
      },
    ]);
  });

  it('rejects an invalid draft payload or id before touching the database', async () => {
    const admin = fakeAdmin([]);
    allow(admin.client);
    const { POST } = await collection();
    expect(
      (await POST(post({ data: [], schemaVersion: 1 }), context())).status
    ).toBe(400);
    expect(
      (await POST(post({ data: {}, schemaVersion: 0 }), context())).status
    ).toBe(400);
    const badId = {
      params: Promise.resolve({ entryId: 'nope', wsId: 'ieeai' }),
    };
    expect(
      (await POST(post({ data: {}, schemaVersion: 1 }), badId)).status
    ).toBe(400);
    expect(admin.calls.filter(([method]) => method === 'insert')).toEqual([]);
  });

  it('returns 404 for an entry outside the workspace', async () => {
    allow(
      fakeAdmin([{ data: null, error: { code: '23503', message: 'fk' } }])
        .client
    );
    const response = await (await collection()).POST(
      post({ data: {}, schemaVersion: 1 }),
      context()
    );
    expect(response.status).toBe(404);
  });

  it('publishes a version of this entry through the database function', async () => {
    const admin = fakeAdmin([
      { data: { id: VERSION }, error: null },
      { data: { id: VERSION, status: 'published' }, error: null },
    ]);
    allow(admin.client);
    const response = await (await publish()).POST(post({}), context(VERSION));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: VERSION, status: 'published' });
    expect(mocks.access).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'publish' })
    );
    expect(admin.calls).toContainEqual([
      'rpc',
      'publish_workspace_external_project_page_version',
      { p_actor_id: 'user-1', p_version_id: VERSION, p_ws_id: WS },
    ]);
  });

  it('does not publish a version from another entry or workspace', async () => {
    const admin = fakeAdmin([{ data: null, error: null }]);
    allow(admin.client);
    const response = await (await publish()).POST(post({}), context(VERSION));
    expect(response.status).toBe(404);
    expect(admin.calls.some(([method]) => method === 'rpc')).toBe(false);
  });

  it('returns 409 when the workspace has no enabled CMS binding', async () => {
    allow(
      fakeAdmin([
        { data: { id: VERSION }, error: null },
        { data: null, error: { code: '55000', message: 'unbound' } },
      ]).client
    );
    const response = await (await publish()).POST(post({}), context(VERSION));
    expect(response.status).toBe(409);
  });

  it('delivers only the published version through the database read', async () => {
    const { getPublishedPageVersion } = await import(
      '@/lib/external-projects/page-versions'
    );
    const admin = fakeAdmin([
      { data: [{ id: VERSION, status: 'published' }], error: null },
      { data: [], error: null },
    ]);
    const scope = { entryId: ENTRY, workspaceId: WS };
    expect(await getPublishedPageVersion(admin.client as never, scope)).toEqual(
      {
        id: VERSION,
        status: 'published',
      }
    );
    expect(
      await getPublishedPageVersion(admin.client as never, scope)
    ).toBeNull();
    expect(admin.calls[0]).toEqual([
      'rpc',
      'get_published_workspace_external_project_page_version',
      { p_entry_id: ENTRY, p_ws_id: WS },
    ]);
  });

  it('maps a database permission denial to 403', async () => {
    allow(
      fakeAdmin([
        { data: { id: VERSION }, error: null },
        { data: null, error: { code: '42501', message: 'denied' } },
      ]).client
    );
    const response = await (await publish()).POST(post({}), context(VERSION));
    expect(response.status).toBe(403);
  });
});
