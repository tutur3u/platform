import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  create: vi.fn(),
  listUsers: vi.fn(),
  deleteOne: vi.fn(),
  mint: vi.fn(),
}));
vi.mock('@/lib/qa-test-users/authorization', () => ({
  requireQaOperator: mocks.access,
}));
vi.mock('@/lib/qa-test-users/provision', () => ({
  createQaUsers: mocks.create,
}));
vi.mock('@/lib/qa-test-users/deletion', () => ({
  deleteQaUser: mocks.deleteOne,
  deleteQaUsers: vi.fn(),
}));
vi.mock('@/lib/qa-test-users/session', async (original) => ({
  ...(await original<typeof import('@/lib/qa-test-users/session')>()),
  mintQaSession: mocks.mint,
}));
vi.mock('@/lib/qa-test-users/runtime', () => ({
  createQaProvisionDeps: () => ({}),
  createQaDeletionDeps: () => ({}),
  createQaSessionDeps: () => ({ supabaseUrl: 'https://db.example.test' }),
}));
vi.mock('@/lib/qa-test-users/store', async (original) => ({
  ...(await original<typeof import('@/lib/qa-test-users/store')>()),
  createQaStore: () => ({ listUsers: mocks.listUsers }),
}));
vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: vi.fn(async () => undefined),
}));
vi.mock('@tuturuuu/supabase/next/common', () => ({
  getSupabaseCookieOptions: (_url: string, origin: string) => {
    const { hostname } = new URL(origin);
    return hostname === 'tuturuuu.com' || hostname.endsWith('.tuturuuu.com')
      ? { domain: '.tuturuuu.com' }
      : {};
  },
}));

import { DELETE } from './[userId]/route';
import { resolveSessionOrigin } from '@/lib/qa-test-users/session';
import { POST as SESSION } from './[userId]/session/route';
import { GET, POST } from './route';

const operator = { id: '11111111-1111-4111-8111-111111111111' };
const userId = '22222222-2222-4222-8222-222222222222';
const json = (path: string, body: unknown, method = 'POST') =>
  new Request(`https://tuturuuu.com/api/v1/admin/qa/test-users${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const params = (id: string) => ({ params: Promise.resolve({ userId: id }) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ ok: true, admin: {}, operator });
});

describe('QA test user admin routes', () => {
  it('refuses unauthorized callers before any ledger work', async () => {
    mocks.access.mockResolvedValue({
      ok: false,
      response: Response.json({ error: 'Forbidden' }, { status: 403 }),
    });
    expect((await GET(new Request('https://tuturuuu.com/x'))).status).toBe(403);
    expect((await POST(json('', { count: 1 }))).status).toBe(403);
    expect(
      (await DELETE(new Request('https://tuturuuu.com/x'), params(userId)))
        .status
    ).toBe(403);
    expect(
      (await SESSION(json(`/${userId}/session`, {}), params(userId))).status
    ).toBe(403);
    expect(mocks.listUsers).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.deleteOne).not.toHaveBeenCalled();
    expect(mocks.mint).not.toHaveBeenCalled();
  });

  it.each([
    ['Origin', { origin: 'https://tuturuuu.com' }],
    ['Sec-Fetch-Site', { 'sec-fetch-site': 'same-origin' }],
  ])(
    'refuses a browser session mint carrying only %s before authorization or minting',
    async (_name, browserHeaders) => {
      const browser = new Request(
        `https://tuturuuu.com/api/v1/admin/qa/test-users/${userId}/session`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...browserHeaders },
          body: '{}',
        }
      );
      const response = await SESSION(browser, params(userId));
      expect(response.status).toBe(403);
      expect(response.headers.get('cache-control')).toMatch(/no-store/u);
      await expect(response.json()).resolves.toMatchObject({
        code: 'MOBILE_SESSION_BROWSER_REFUSED',
      });
      expect(mocks.access).not.toHaveBeenCalled();
      expect(mocks.mint).not.toHaveBeenCalled();
    }
  );

  it('validates create input and never caches the credential response', async () => {
    expect((await POST(json('', { count: 1 }))).status).toBe(400);
    const text = new Request('https://tuturuuu.com/x', {
      method: 'POST',
      body: JSON.stringify({ count: 1, purpose: 'meet', ttlSeconds: 3600 }),
    });
    expect((await POST(text)).status).toBe(400);
    mocks.create.mockResolvedValue({
      runId: 'abcd1234',
      users: [{}],
      failed: [],
    });
    const created = await POST(
      json('', {
        count: 1,
        purpose: 'meet-rehearsal',
        ttlSeconds: 3600,
        tier: 'pro',
        staff: true,
      })
    );
    expect(created.status).toBe(201);
    expect(created.headers.get('cache-control')).toContain('no-store');
    expect(mocks.create).toHaveBeenCalledWith(
      {},
      operator.id,
      expect.objectContaining({ tier: 'PRO', staff: true })
    );
  });

  it('rejects malformed run and user identifiers', async () => {
    expect(
      (await GET(new Request('https://tuturuuu.com/x?run=../../x'))).status
    ).toBe(400);
    expect(
      (
        await DELETE(
          new Request('https://tuturuuu.com/x'),
          params('not-a-uuid')
        )
      ).status
    ).toBe(400);
  });

  it('maps deletion outcomes to statuses', async () => {
    mocks.deleteOne.mockResolvedValue('pending');
    expect(
      (await DELETE(new Request('https://tuturuuu.com/x'), params(userId)))
        .status
    ).toBe(202);
    mocks.deleteOne.mockResolvedValue('deleted');
    expect(
      (await DELETE(new Request('https://tuturuuu.com/x'), params(userId)))
        .status
    ).toBe(200);
  });

  it('mints sessions only from a JSON request', async () => {
    const response = await SESSION(
      new Request(
        `https://tuturuuu.com/api/v1/admin/qa/test-users/${userId}/session`,
        {
          method: 'POST',
          headers: { 'content-type': 'text/plain' },
          body: '{}',
        }
      ),
      params(userId)
    );
    expect(response.status).toBe(400);
    expect(mocks.mint).not.toHaveBeenCalled();
  });

  it('mints sessions only for first-party origins', async () => {
    const response = await SESSION(
      json(`/${userId}/session`, { origin: 'https://evil.example' }),
      params(userId)
    );
    expect(response.status).toBe(400);
    expect(mocks.mint).not.toHaveBeenCalled();
    mocks.mint.mockResolvedValue({ userId });
    const ok = await SESSION(
      json(`/${userId}/session`, { origin: 'https://meet.tuturuuu.com' }),
      params(userId)
    );
    expect(ok.status).toBe(201);
    expect(mocks.mint).toHaveBeenCalledWith(
      expect.anything(),
      userId,
      operator.id,
      'https://meet.tuturuuu.com'
    );
  });
});

describe('resolveSessionOrigin', () => {
  const db = 'https://db.example.test';
  it('defaults to the request origin and accepts shared-scope HTTPS origins', () => {
    expect(resolveSessionOrigin('https://tuturuuu.com', undefined, db)).toBe(
      'https://tuturuuu.com'
    );
    expect(
      resolveSessionOrigin(
        'https://tuturuuu.com',
        'https://meet.tuturuuu.com/x',
        db
      )
    ).toBe('https://meet.tuturuuu.com');
    expect(
      resolveSessionOrigin(
        'https://tuturuuu.com',
        'http://meet.tuturuuu.com',
        db
      )
    ).toBeNull();
    expect(
      resolveSessionOrigin(
        'https://tuturuuu.com',
        'https://tuturuuu.com.evil.example',
        db
      )
    ).toBeNull();
  });
});
