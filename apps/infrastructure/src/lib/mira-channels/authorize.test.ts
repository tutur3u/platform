import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  getPermissions: vi.fn(),
  resolveActor: vi.fn(),
}));

vi.mock('@tuturuuu/satellite/workspace-access', () => ({
  resolveSatelliteRequestActor: (...args: unknown[]) =>
    mocks.resolveActor(...args),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: unknown[]) => mocks.getPermissions(...args),
}));

import { authorizeMiraOperator } from './authorize';

function permissions(granted: string[]) {
  return {
    withoutPermission: (permission: string) => !granted.includes(permission),
  };
}

describe('authorizeMiraOperator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveActor.mockResolvedValue({
      admin: {},
      user: { id: 'operator-1' },
    });
  });

  it('refuses bearer callers before resolving a session', async () => {
    const result = await authorizeMiraOperator(
      new Request('https://admin.test/api', {
        headers: { authorization: 'Bearer token' },
      })
    );
    expect(result.ok).toBe(false);
    expect(mocks.resolveActor).not.toHaveBeenCalled();
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it('refuses root admins without the explicit operator grant', async () => {
    mocks.getPermissions.mockResolvedValue(permissions(['admin']));
    const result = await authorizeMiraOperator(
      new Request('https://admin.test/api')
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it('admits root admins holding operate_mira_channels', async () => {
    mocks.getPermissions.mockResolvedValue(
      permissions(['admin', 'operate_mira_channels'])
    );
    const result = await authorizeMiraOperator(
      new Request('https://admin.test/api')
    );
    expect(result).toMatchObject({ ok: true, actorId: 'operator-1' });
    expect(mocks.getPermissions).toHaveBeenCalledWith(
      expect.objectContaining({
        wsId: '00000000-0000-0000-0000-000000000000',
      })
    );
  });
});
