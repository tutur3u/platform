import { createHmac } from 'node:crypto';
import { createCliAppSession } from '@tuturuuu/auth/cli-session';
import { createAppCoordinationToken } from '@tuturuuu/auth/app-coordination';
import {
  APP_SESSION_SCOPE,
  createAppSessionToken,
} from '@tuturuuu/auth/app-session';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GET } from './route';

const mocks = vi.hoisted(() => ({
  membership: vi.fn(),
  members: vi.fn(),
}));
vi.mock('next/server', () => ({ connection: vi.fn(), NextResponse: {} }));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({}),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: mocks.membership,
}));
vi.mock('@/lib/workspace-members', () => ({
  getWorkspaceMembers: mocks.members,
}));

const userId = '00000000-0000-4000-8000-000000000001';
const workspaceId = 'a65cebd7-3a8c-4883-a3d9-82f9703d652f';
const secret = 'synthetic-cli-signing-secret-for-route-test';
const key = Buffer.alloc(32, 27);
const query = 'from=2026-11-26&to=2026-11-26';
const path = '/admin/api/internal/handbook/stats';
const row = { day: '2026-11-26', lang: 'vi', event: 'view', n: 3 };
const member = {
  id: userId,
  pending: false,
  workspace_member_type: 'MEMBER',
  is_creator: true,
};
const upstream = vi.fn();
let access: string;
let refresh: string;

function request(token = access, search = query) {
  return new Request(
    `https://tuturuuu.com/api/v1/ieeai/handbook/stats?${search}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
}

beforeEach(() => {
  vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', secret);
  vi.stubEnv('APP_COORDINATION_TOKEN_NEXT_SECRET', '');
  vi.stubEnv('APP_COORDINATION_TOKEN_SECRET', '');
  vi.stubEnv('SUPABASE_SECRET_KEY', '');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
  vi.stubEnv('SUPABASE_SERVICE_KEY', '');
  vi.stubEnv('APP_COORDINATION_TOKEN_SIGNER', '');
  vi.stubEnv('IEEAI_CLI_STATS_HANDOFF_KEY', key.toString('base64url') + '=');
  const session = createCliAppSession({ userId }, { secret });
  access = session.access.token;
  refresh = session.refresh.token;
  vi.stubGlobal('fetch', upstream);
  mocks.membership.mockResolvedValue({ ok: true });
  mocks.members.mockResolvedValue([member]);
  upstream.mockImplementation(async () =>
    Response.json({ rows: [{ ...row, email: 'discard' }], identity: 'discard' })
  );
});

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it.each([true, false])(
  'allows explicit entitlement with creator=%s and signs only the handoff',
  async (creator) => {
    mocks.members.mockResolvedValue([
      {
        ...member,
        is_creator: creator,
        roles: creator
          ? []
          : [
              {
                id: 'assigned',
                permissions: [{ permission: 'admin', enabled: true }],
              },
            ],
      },
    ]);
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      from: row.day,
      to: row.day,
      timezone: 'Asia/Ho_Chi_Minh',
      rows: [row],
    });
    expect(mocks.membership).toHaveBeenCalledWith(
      expect.objectContaining({ userId, wsId: workspaceId })
    );
    expect(mocks.members).toHaveBeenCalledWith(
      expect.objectContaining({ wsId: workspaceId, status: 'joined' })
    );
    expect(upstream).toHaveBeenCalledTimes(1);
    const [url, options] = upstream.mock.calls[0]!;
    expect(url).toBe(`https://ieeai.net${path}?${query}`);
    expect(options).toMatchObject({
      method: 'GET',
      redirect: 'error',
      cache: 'no-store',
    });
    const ts = options.headers['x-ieeai-cli-ts'];
    const nonce = options.headers['x-ieeai-cli-nonce'];
    expect(Number(ts)).toBeGreaterThanOrEqual(
      Math.floor(Date.now() / 1000) - 1
    );
    expect(nonce).toMatch(/^[\w-]{22}$/u);
    const canonical = [
      'ieeai-cli-stats-v1',
      'tuturuuu',
      'ieeai-admin',
      'GET',
      path,
      query,
      ts,
      nonce,
    ].join('\n');
    expect(options.headers).toEqual({
      'x-ieeai-cli-ts': ts,
      'x-ieeai-cli-nonce': nonce,
      'x-ieeai-cli-signature': createHmac('sha256', key)
        .update(canonical)
        .digest('base64url'),
    });
  }
);

it('denies invalid, expired, refresh and wrong-target tokens before access checks', async () => {
  const expired = createCliAppSession({ userId }, { now: new Date(0), secret })
    .access.token;
  const wrongTarget = createAppSessionToken(
    {
      userId,
      targetApp: 'calendar',
      scopes: ['cli:access'],
    },
    { secret }
  ).token;
  for (const token of ['ttr_app_invalid', expired, refresh, wrongTarget]) {
    expect((await GET(request(token))).status).toBe(401);
  }
  expect(mocks.membership).not.toHaveBeenCalled();
  expect(upstream).not.toHaveBeenCalled();
});

it('denies removed, pending, mismatched and default-only members before handoff', async () => {
  mocks.membership.mockResolvedValueOnce({ ok: false });
  expect((await GET(request())).status).toBe(403);
  expect(mocks.members).not.toHaveBeenCalled();

  for (const candidate of [
    { ...member, pending: true },
    { ...member, id: 'wrong-user' },
    { ...member, workspace_member_type: 'GUEST' },
    {
      ...member,
      is_creator: false,
      default_permissions: [{ permission: 'admin', enabled: true }],
    },
  ]) {
    mocks.members.mockResolvedValueOnce([candidate]);
    expect((await GET(request())).status).toBe(403);
  }
  expect(upstream).not.toHaveBeenCalled();
});

it('denies invalid ranges and workspace overrides before handoff', async () => {
  for (const search of [
    'from=2026-02-30&to=2026-03-01',
    'from=2026-01-01&to=2027-02-05',
    `${query}&wsId=other`,
    `${query}&to=2026-11-27`,
  ]) {
    expect((await GET(request(access, search))).status).toBe(400);
  }
  expect(mocks.membership).not.toHaveBeenCalled();
  expect(upstream).not.toHaveBeenCalled();
});

it('rejects redirects, duplicate rows, and oversized upstream bodies', async () => {
  upstream
    .mockResolvedValueOnce(Response.redirect('https://example.invalid'))
    .mockResolvedValueOnce(Response.json({ rows: [row, row] }))
    .mockResolvedValueOnce(
      Response.json({ rows: [], filler: 'x'.repeat(262_144) })
    );
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await GET(request());
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: 'Handbook stats unavailable',
    });
  }
  expect(upstream).toHaveBeenCalledTimes(3);
});

it('denies a token explicitly bound to another workspace', async () => {
  const token = createAppCoordinationToken(
    {
      originApp: 'cli',
      scopes: ['cli:access', APP_SESSION_SCOPE],
      targetApp: 'platform',
      userId,
      workspaceId: '00000000-0000-4000-8000-000000000002',
    },
    { secret }
  ).token;
  expect((await GET(request(token))).status).toBe(403);
  expect(mocks.membership).not.toHaveBeenCalled();
  expect(upstream).not.toHaveBeenCalled();
});

it('accepts a 400-day range and refuses missing handoff configuration', async () => {
  const search = 'from=2026-01-01&to=2027-02-04';
  expect((await GET(request(access, search))).status).toBe(200);
  vi.stubEnv('IEEAI_CLI_STATS_HANDOFF_KEY', '');
  expect((await GET(request(access, search))).status).toBe(502);
  expect(upstream).toHaveBeenCalledTimes(1);
});

it('refuses an automatic HEAD request before checking membership', async () => {
  const get = request();
  const head = new Request(get.url, { method: 'HEAD', headers: get.headers });
  const response = await GET(head);
  expect(response.status).toBe(405);
  expect(response.headers.get('allow')).toBe('GET');
  expect(mocks.membership).not.toHaveBeenCalled();
  expect(upstream).not.toHaveBeenCalled();
});
