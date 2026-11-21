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

import {
  authorizeMiraOperator,
  MIRA_OPERATOR_ACTION_HEADER,
} from './authorize';

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

  it('refuses cookie writes without same-origin intent', async () => {
    mocks.getPermissions.mockResolvedValue(
      permissions(['admin', 'operate_mira_channels'])
    );
    const url =
      'https://tuturuuu.test/admin/api/v1/infrastructure/mira/global-stop';
    const intent = {
      'content-type': 'application/json',
      origin: 'https://tuturuuu.test',
      'sec-fetch-site': 'same-origin',
      [MIRA_OPERATOR_ACTION_HEADER]: '1',
    };
    const refused = [
      { ...intent, origin: 'https://evil.tuturuuu.test' },
      { ...intent, 'sec-fetch-site': 'same-site' },
      { ...intent, 'content-type': 'text/plain' },
      { ...intent, [MIRA_OPERATOR_ACTION_HEADER]: '' },
    ];
    for (const headers of refused) {
      const result = await authorizeMiraOperator(
        new Request(url, { method: 'POST', headers }),
        { write: true }
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.response.status).toBe(403);
    }
    const admitted = await authorizeMiraOperator(
      new Request(url, { method: 'POST', headers: intent }),
      { write: true }
    );
    expect(admitted.ok).toBe(true);
  });

  it('accepts the app-session bearer the Admin proxy attaches', async () => {
    mocks.getPermissions.mockResolvedValue(
      permissions(['admin', 'operate_mira_channels'])
    );
    const result = await authorizeMiraOperator(
      new Request('https://admin.test/api', {
        headers: { authorization: 'Bearer ttr_app_fixture' },
      })
    );
    expect(result.ok).toBe(true);
    expect(mocks.resolveActor).toHaveBeenCalled();
  });
});
