import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  from: vi.fn(),
  getUpstashRestRedisClient: vi.fn(),
  resolveAuthenticatedSessionUser: vi.fn(),
  serverLoggerError: vi.fn(),
  unblockIP: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: (...args: unknown[]) =>
    mocks.resolveAuthenticatedSessionUser(...args),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: unknown[]) => mocks.createAdminClient(...args),
  createClient: (...args: unknown[]) => mocks.createClient(...args),
}));

vi.mock('@tuturuuu/utils/abuse-protection', () => ({
  BLOCK_DURATIONS: {
    1: 300,
    2: 900,
    3: 3600,
    4: 86_400,
  },
  REDIS_KEYS: {
    IP_BLOCKED: (ipAddress: string) => `blocked:${ipAddress}`,
    IP_BLOCK_LEVEL: (ipAddress: string) => `level:${ipAddress}`,
  },
  WINDOW_MS: {
    TWENTY_FOUR_HOURS: 86_400_000,
  },
  unblockIP: (...args: unknown[]) => mocks.unblockIP(...args),
}));

vi.mock('@tuturuuu/utils/upstash-rest', () => ({
  getUpstashRestRedisClient: (...args: unknown[]) =>
    mocks.getUpstashRestRedisClient(...args),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: (...args: unknown[]) => mocks.serverLoggerError(...args),
  },
}));

import { DELETE } from './route';

function makeDeleteRequest(body: unknown) {
  return new Request('http://localhost/api/v1/infrastructure/blocked-ips', {
    body: JSON.stringify(body),
    method: 'DELETE',
  });
}

function mockRootWorkspaceMembership(data: unknown) {
  const single = vi.fn().mockResolvedValue({ data, error: null });
  const secondEq = vi.fn(() => ({ single }));
  const firstEq = vi.fn(() => ({ eq: secondEq }));
  const select = vi.fn(() => ({ eq: firstEq }));

  mocks.from.mockReturnValue({ select });

  return {
    firstEq,
    secondEq,
    select,
    single,
  };
}

describe('blocked IP route DELETE', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({ from: mocks.from });
    mocks.unblockIP.mockResolvedValue(true);
  });

  it('allows exact @tuturuuu.com users to unblock an IP without root membership lookup', async () => {
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      user: {
        email: 'ops@tuturuuu.com',
        id: 'staff-1',
      },
    });
    mockRootWorkspaceMembership(null);

    const response = await DELETE(
      makeDeleteRequest({
        ip_address: '203.0.113.10',
        reason: 'False-positive diagnostics clear',
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.unblockIP).toHaveBeenCalledWith(
      '203.0.113.10',
      'staff-1',
      'False-positive diagnostics clear'
    );
  });

  it('allows non-staff root workspace users to unblock an IP', async () => {
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      user: {
        email: 'admin@example.com',
        id: 'admin-1',
      },
    });
    const membershipQuery = mockRootWorkspaceMembership({
      platform_user_id: 'admin-1',
    });

    const response = await DELETE(
      makeDeleteRequest({
        ip_address: '203.0.113.10',
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.from).toHaveBeenCalledWith('workspace_user_linked_users');
    expect(membershipQuery.secondEq).toHaveBeenCalledWith(
      'ws_id',
      '00000000-0000-0000-0000-000000000000'
    );
    expect(mocks.unblockIP).toHaveBeenCalledWith(
      '203.0.113.10',
      'admin-1',
      undefined
    );
  });

  it('rejects non-staff users without root workspace membership', async () => {
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      user: {
        email: 'member@example.com',
        id: 'member-1',
      },
    });
    mockRootWorkspaceMembership(null);

    const response = await DELETE(
      makeDeleteRequest({
        ip_address: '203.0.113.10',
      })
    );

    expect(response.status).toBe(403);
    expect(mocks.unblockIP).not.toHaveBeenCalled();
  });
});
