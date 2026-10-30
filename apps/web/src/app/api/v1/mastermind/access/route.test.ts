import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  getPermissions: vi.fn(),
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (handler: (request: Request, auth: unknown, params: unknown) => Response) =>
    async (request: Request) =>
      handler(request, { user: { id: 'user-1', email: 'u@example.com' } }, {}),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: unknown[]) => mocks.getPermissions(...args),
}));

function holds(...granted: string[]) {
  mocks.getPermissions.mockResolvedValue({
    containsPermission: (permission: string) => granted.includes(permission),
  });
}

async function access() {
  const { GET } = await import('./route');
  const response = await GET(
    new NextRequest('http://localhost/api/v1/mastermind/access')
  );
  expect(response.status).toBe(200);
  return (await response.json()) as { enabled: boolean };
}

// Product rule: apps/docs/platform/features/mobile-mastermind.mdx#rollout
describe('GET /api/v1/mastermind/access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('explicit-grant flag off (default)', () => {
    beforeEach(() => {
      vi.stubEnv('MASTERMIND_REQUIRE_EXPLICIT_GRANT', '');
    });

    it('keeps the earlier root view_infrastructure rule', async () => {
      holds('view_infrastructure');

      await expect(access()).resolves.toEqual({ enabled: true });
      expect(mocks.getPermissions).toHaveBeenCalledWith({
        user: expect.objectContaining({ id: 'user-1' }),
        wsId: ROOT_WORKSPACE_ID,
      });
    });

    it('denies without root view_infrastructure', async () => {
      holds('manage_mastermind');

      await expect(access()).resolves.toEqual({ enabled: false });
    });
  });

  describe('explicit-grant flag on', () => {
    beforeEach(() => {
      vi.stubEnv('MASTERMIND_REQUIRE_EXPLICIT_GRANT', 'true');
    });

    it('requires root manage_mastermind', async () => {
      holds('manage_mastermind');

      await expect(access()).resolves.toEqual({ enabled: true });
    });

    it('no longer admits view_infrastructure alone', async () => {
      holds('view_infrastructure');

      await expect(access()).resolves.toEqual({ enabled: false });
    });
  });

  it('denies a user outside the root workspace', async () => {
    mocks.getPermissions.mockResolvedValue(null);

    await expect(access()).resolves.toEqual({ enabled: false });
  });
});
