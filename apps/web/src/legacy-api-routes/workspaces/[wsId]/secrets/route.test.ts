import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  canMutateManagedCronEnableSecretMock,
  createManagedCronSecretAdminClientMock,
  getWorkspaceSecretsAccessMock,
} = vi.hoisted(() => ({
  canMutateManagedCronEnableSecretMock: vi.fn(),
  createManagedCronSecretAdminClientMock: vi.fn(),
  getWorkspaceSecretsAccessMock: vi.fn(),
}));

vi.mock('./access', () => ({
  getWorkspaceSecretsAccess: getWorkspaceSecretsAccessMock,
}));

vi.mock('@/lib/workspace-secrets/managed-cron', () => ({
  canMutateManagedCronEnableSecret: canMutateManagedCronEnableSecretMock,
  createManagedCronSecretAdminClient: createManagedCronSecretAdminClientMock,
  isManagedCronEnableSecretName: (name?: string | null) =>
    name?.trim().toUpperCase() === 'MANAGED_CRON_ENABLED',
  MANAGED_CRON_ENABLED_SECRET: 'MANAGED_CRON_ENABLED',
}));

import { GET, POST } from './route';

describe('workspace secrets collection route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    canMutateManagedCronEnableSecretMock.mockResolvedValue(false);
  });

  it('uses the resolved workspace id for GET queries', async () => {
    const orderMock = vi
      .fn()
      .mockResolvedValue({ data: [{ id: 'secret-1' }], error: null });
    const eqMock = vi.fn(() => ({
      order: orderMock,
    }));
    const selectMock = vi.fn(() => ({
      eq: eqMock,
    }));
    const fromMock = vi.fn(() => ({
      select: selectMock,
    }));

    getWorkspaceSecretsAccessMock.mockResolvedValue({
      allowed: true,
      db: { from: fromMock },
      resolvedWsId: 'resolved-ws',
    });

    const response = await GET(new Request('http://localhost'), {
      params: Promise.resolve({ wsId: 'friendly-ws' }),
    });

    expect(fromMock).toHaveBeenCalledWith('workspace_secrets');
    expect(eqMock).toHaveBeenCalledWith('ws_id', 'resolved-ws');
    expect(orderMock).toHaveBeenCalledWith('name', { ascending: true });
    await expect(response.json()).resolves.toEqual([{ id: 'secret-1' }]);
  });

  it('uses the resolved workspace id for POST inserts', async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    const fromMock = vi.fn(() => ({
      insert: insertMock,
    }));

    getWorkspaceSecretsAccessMock.mockResolvedValue({
      allowed: true,
      db: { from: fromMock },
      resolvedWsId: 'resolved-ws',
    });

    const response = await POST(
      new Request('http://localhost', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'EMAIL_RATE_LIMIT_MINUTE',
          value: '100',
        }),
      }),
      {
        params: Promise.resolve({ wsId: 'friendly-ws' }),
      }
    );

    expect(insertMock).toHaveBeenCalledWith({
      name: 'EMAIL_RATE_LIMIT_MINUTE',
      value: '100',
      ws_id: 'resolved-ws',
    });
    expect(createManagedCronSecretAdminClientMock).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
  });

  it('rejects managed cron enablement from non-employee users', async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    const fromMock = vi.fn(() => ({
      insert: insertMock,
    }));

    getWorkspaceSecretsAccessMock.mockResolvedValue({
      allowed: true,
      db: { from: fromMock },
      resolvedWsId: 'resolved-ws',
    });

    const response = await POST(
      new Request('http://localhost', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'MANAGED_CRON_ENABLED',
          value: 'true',
        }),
      }),
      {
        params: Promise.resolve({ wsId: 'friendly-ws' }),
      }
    );

    expect(canMutateManagedCronEnableSecretMock).toHaveBeenCalledOnce();
    expect(insertMock).not.toHaveBeenCalled();
    expect(response.status).toBe(403);
  });

  it('writes verified-staff managed cron enablement with the service role', async () => {
    canMutateManagedCronEnableSecretMock.mockResolvedValue(true);
    const userInsertMock = vi.fn();
    const adminInsertMock = vi.fn().mockResolvedValue({ error: null });
    const adminFromMock = vi.fn(() => ({
      insert: adminInsertMock,
    }));
    createManagedCronSecretAdminClientMock.mockResolvedValue({
      from: adminFromMock,
    });

    getWorkspaceSecretsAccessMock.mockResolvedValue({
      allowed: true,
      db: { from: vi.fn(() => ({ insert: userInsertMock })) },
      resolvedWsId: 'resolved-ws',
    });

    const response = await POST(
      new Request('http://localhost', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'MANAGED_CRON_ENABLED',
          value: 'true',
        }),
      }),
      {
        params: Promise.resolve({ wsId: 'friendly-ws' }),
      }
    );

    expect(canMutateManagedCronEnableSecretMock).toHaveBeenCalledOnce();
    expect(adminFromMock).toHaveBeenCalledWith('workspace_secrets');
    expect(adminInsertMock).toHaveBeenCalledWith({
      name: 'MANAGED_CRON_ENABLED',
      value: 'true',
      ws_id: 'resolved-ws',
    });
    expect(userInsertMock).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
  });

  it('returns the access helper status when authorization fails', async () => {
    getWorkspaceSecretsAccessMock.mockResolvedValue({
      allowed: false,
      message: 'Permission denied',
      status: 403,
    });

    const response = await GET(new Request('http://localhost'), {
      params: Promise.resolve({ wsId: 'friendly-ws' }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: 'Permission denied',
    });
  });
  it.each(
    ['MANAGED_CRON_ENABLED', 'EMAIL_RATE_LIMIT_MINUTE'].flatMap((name) =>
      ['ws_id', 'id', 'created_at'].map((field) => ({ name, field }))
    )
  )(
    'rejects $field on $name without any database mutation',
    async ({ name, field }) => {
      canMutateManagedCronEnableSecretMock.mockResolvedValue(true);
      const fromMock = vi.fn();
      getWorkspaceSecretsAccessMock.mockResolvedValue({
        allowed: true,
        db: { from: fromMock },
        resolvedWsId: 'resolved-ws',
      });
      const response = await POST(
        new Request('http://localhost', {
          method: 'POST',
          body: JSON.stringify({
            name,
            value: 'true',
            [field]: 'other-workspace',
          }),
        }),
        {
          params: Promise.resolve({
            wsId: 'friendly-ws',
            secretId: 'secret-1',
          }),
        }
      );
      expect(response.status).toBe(400);
      expect(fromMock).not.toHaveBeenCalled();
      expect(createManagedCronSecretAdminClientMock).not.toHaveBeenCalled();
    }
  );

  it.each([
    null,
    [],
    { name: 42, value: 'true' },
    { name: 'TEST' },
    { name: '', value: 'true' },
  ])('rejects invalid body %j', async (body) => {
    const response = await POST(
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ wsId: 'friendly-ws', secretId: 'secret-1' }) }
    );
    expect(response.status).toBe(400);
    expect(createManagedCronSecretAdminClientMock).not.toHaveBeenCalled();
  });
});
