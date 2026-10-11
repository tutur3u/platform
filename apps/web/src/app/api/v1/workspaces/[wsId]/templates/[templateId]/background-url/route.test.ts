import { connection, NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: vi.fn().mockResolvedValue(undefined),
}));

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  client: vi.fn(),
  membership: vi.fn(),
  normalize: vi.fn(),
  session: vi.fn(),
  sign: vi.fn(),
  storage: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
  createClient: mocks.client,
  createDynamicAdminClient: mocks.storage,
}));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: mocks.session,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: mocks.normalize,
  verifyWorkspaceMembershipType: mocks.membership,
}));

const WORKSPACE = '11111111-1111-4111-8111-111111111111';
const TEMPLATE = '33333333-3333-4333-8333-333333333333';
const OWNER = '44444444-4444-4444-8444-444444444444';
const MEMBER = '55555555-5555-4555-8555-555555555555';
const PATH = `${WORKSPACE}/template-backgrounds/synthetic.png`;
let fixture: Record<string, unknown> | null;
let lookupError: { message: string } | null;

function datastore() {
  return {
    from(table: string) {
      if (table !== 'board_templates') throw new Error('Unexpected table');
      let columns: string[] = [];
      const filters = new Map<string, unknown>();
      const query = {
        select(value: string) {
          columns = value.split(',').map((column) => column.trim());
          return query;
        },
        eq(column: string, value: unknown) {
          filters.set(column, value);
          return query;
        },
        async maybeSingle() {
          const row = fixture;
          const matches =
            row && [...filters].every(([key, value]) => row[key] === value);
          return {
            data:
              row && matches
                ? Object.fromEntries(columns.map((key) => [key, row[key]]))
                : null,
            error: lookupError,
          };
        },
      };
      return query;
    },
  };
}

async function request(method: 'GET' | 'HEAD' = 'GET') {
  const route = await import('./route');
  return route[method](
    new NextRequest('http://localhost/background-url', { method }),
    { params: Promise.resolve({ templateId: TEMPLATE, wsId: WORKSPACE }) }
  );
}

function noStorage() {
  expect(mocks.storage).not.toHaveBeenCalled();
  expect(mocks.sign).not.toHaveBeenCalled();
}

describe('first-class template background policy and HEAD', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(connection).mockResolvedValue(undefined);
    fixture = {
      background_path: PATH,
      created_by: OWNER,
      id: TEMPLATE,
      visibility: 'workspace',
      ws_id: WORKSPACE,
    };
    lookupError = null;
    mocks.client.mockResolvedValue({ fixture: 'session' });
    mocks.session.mockResolvedValue({ authError: null, user: { id: MEMBER } });
    mocks.normalize.mockResolvedValue(WORKSPACE);
    mocks.membership.mockResolvedValue({ ok: true });
    mocks.admin.mockResolvedValue(datastore());
    mocks.storage.mockResolvedValue({
      storage: {
        from(bucket: string) {
          if (bucket !== 'workspaces') throw new Error('Unexpected bucket');
          return { createSignedUrl: mocks.sign };
        },
      },
    });
    mocks.sign.mockResolvedValue({
      data: { signedUrl: 'https://storage.example.test/synthetic' },
      error: null,
    });
  });

  it('denies a private noncreator even when no background exists', async () => {
    fixture = { ...fixture, background_path: null, visibility: 'private' };
    expect((await request()).status).toBe(404);
    noStorage();
  });

  it.each([undefined, null, '', 'unknown'])(
    'denies visibility %s before the empty-background response',
    async (visibility) => {
      fixture = { ...fixture, background_path: null, visibility };
      mocks.session.mockResolvedValue({ authError: null, user: { id: OWNER } });
      expect((await request()).status).toBe(404);
      noStorage();
    }
  );

  it.each([undefined, null, ''])(
    'denies missing creator %s even for workspace visibility',
    async (created_by) => {
      fixture = { ...fixture, created_by };
      expect((await request()).status).toBe(404);
      noStorage();
    }
  );

  it('returns nondisclosing 404 for an absent template', async () => {
    fixture = null;
    const response = await request();
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: 'Template not found or access denied',
    });
    noStorage();
  });

  it('fails closed on a datastore error', async () => {
    lookupError = { message: 'synthetic lookup failure' };
    expect((await request()).status).toBe(500);
    noStorage();
  });

  it('rejects an unauthenticated caller before admin lookup', async () => {
    mocks.session.mockResolvedValue({ authError: null, user: null });
    expect((await request()).status).toBe(401);
    expect(mocks.admin).not.toHaveBeenCalled();
    noStorage();
  });

  it('returns a storage failure without claiming a signed URL', async () => {
    mocks.sign.mockResolvedValue({
      data: null,
      error: { message: 'synthetic failure' },
    });
    const response = await request();
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'Failed to load template background',
    });
  });

  it('preserves GET status and headers with a bodyless successful HEAD', async () => {
    const get = await request();
    const head = await request('HEAD');
    expect(head.status).toBe(get.status);
    expect([...head.headers]).toEqual([...get.headers]);
    expect(await head.text()).toBe('');
    expect(connection).toHaveBeenCalledTimes(2);
    expect(mocks.sign).toHaveBeenCalledWith(PATH, 3600);
  });

  it('preserves denial status and headers with a bodyless HEAD', async () => {
    fixture = { ...fixture, visibility: 'private' };
    const get = await request();
    const head = await request('HEAD');
    expect(get.status).toBe(404);
    expect(head.status).toBe(404);
    expect([...head.headers]).toEqual([...get.headers]);
    expect(await head.text()).toBe('');
    noStorage();
  });
});
