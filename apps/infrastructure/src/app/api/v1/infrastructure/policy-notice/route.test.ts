vi.mock('server-only', () => ({}));

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  getUserById: vi.fn(),
  permissions: vi.fn(),
  run: vi.fn(),
  deps: vi.fn(),
}));

vi.mock('@tuturuuu/satellite/workspace-access', () => ({
  resolveSatellitePageActor: mocks.actor,
  resolveSatelliteRequestActor: mocks.actor,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.permissions,
}));
vi.mock('@/lib/policy-notice/sender', async (original) => ({
  ...(await original<typeof import('@/lib/policy-notice/sender')>()),
  runPolicyNotice: mocks.run,
}));
vi.mock('@/lib/policy-notice/runtime', () => ({
  createPolicyNoticeDeps: mocks.deps,
}));

import { PolicyNoticeError } from '@/lib/policy-notice/errors';
import { POST } from './route';

const STAFF = {
  id: 'actor',
  email: 'staff@tuturuuu.com',
  email_confirmed_at: '2026-01-01',
  identities: [{ provider: 'email', identity_data: {} }],
};

function request(
  body: unknown = {},
  headers: Record<string, string> = { origin: 'https://infra.example' }
) {
  return new Request(
    'https://infra.example/api/v1/infrastructure/policy-notice',
    { method: 'POST', body: JSON.stringify(body), headers }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor.mockResolvedValue({
    user: { id: 'actor', email: 'staff@tuturuuu.com' },
    admin: { auth: { admin: { getUserById: mocks.getUserById } } },
  });
  mocks.getUserById.mockResolvedValue({ data: { user: STAFF }, error: null });
  mocks.permissions.mockResolvedValue({
    membershipType: 'MEMBER',
    containsPermission: (p: string) => p === 'manage_workspace_roles',
  });
  mocks.deps.mockReturnValue({});
  mocks.run.mockResolvedValue({ mode: 'dry_run', counts: { eligible: 1 } });
});

describe('policy notice route', () => {
  it.each([
    ['no session', () => mocks.actor.mockResolvedValue(null)],
    [
      'a non-staff address',
      () =>
        mocks.getUserById.mockResolvedValue({
          data: { user: { ...STAFF, email: 'owner@example.com' } },
          error: null,
        }),
    ],
    [
      'an xwf address',
      () =>
        mocks.getUserById.mockResolvedValue({
          data: { user: { ...STAFF, email: 'staff@xwf.tuturuuu.com' } },
          error: null,
        }),
    ],
    [
      'an unconfirmed staff address',
      () =>
        mocks.getUserById.mockResolvedValue({
          data: { user: { ...STAFF, email_confirmed_at: null } },
          error: null,
        }),
    ],
    [
      'a staff account without root role management',
      () =>
        mocks.permissions.mockResolvedValue({
          membershipType: 'MEMBER',
          containsPermission: () => false,
        }),
    ],
    [
      'a root guest',
      () =>
        mocks.permissions.mockResolvedValue({
          membershipType: 'GUEST',
          containsPermission: () => true,
        }),
    ],
  ])('refuses %s before any ledger or send work', async (_label, arrange) => {
    arrange();
    const response = await POST(request({ mode: 'dry_run' }));
    expect(response.status).toBe(403);
    expect(mocks.deps).not.toHaveBeenCalled();
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it('runs a verified staff request with the actor id and returns the result', async () => {
    const response = await POST(request({}));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      mode: 'dry_run',
      counts: { eligible: 1 },
    });
    expect(mocks.run).toHaveBeenCalledWith({}, 'actor', {});
  });

  it.each([
    ['confirm_required', 400],
    ['recipient_not_allowed', 400],
    ['invalid_request', 400],
    ['dry_run_required', 409],
    ['test_send_required', 409],
    ['version_locked', 409],
  ] as const)('maps %s to %i', async (code, status) => {
    mocks.run.mockRejectedValue(new PolicyNoticeError(code));
    const response = await POST(request({ mode: 'live' }));
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: code });
  });

  it('hides unexpected errors', async () => {
    mocks.run.mockRejectedValue(new Error('owner@example.com leaked'));
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain('@');
  });

  it.each([
    ['no Origin header', {}],
    ['another origin', { origin: 'https://evil.example' }],
    ['a sibling subdomain', { origin: 'https://mail.infra.example' }],
    ['the opaque null origin', { origin: 'null' }],
    [
      'a cross-site fetch',
      { origin: 'https://infra.example', 'sec-fetch-site': 'cross-site' },
    ],
  ])(
    'refuses %s with 403 before any session lookup',
    async (_label, headers) => {
      const response = await POST(request({}, headers));
      expect(response.status).toBe(403);
      expect(mocks.actor).not.toHaveBeenCalled();
      expect(mocks.run).not.toHaveBeenCalled();
    }
  );

  it('accepts a same-origin browser request', async () => {
    const response = await POST(
      request(
        {},
        { origin: 'https://infra.example', 'sec-fetch-site': 'same-origin' }
      )
    );
    expect(response.status).toBe(200);
  });
});
