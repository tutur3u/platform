import { beforeEach, describe, expect, it, vi } from 'vitest';

const { canMutateManagedCronEnableSecretMock, getWorkspaceSecretsAccessMock } =
  vi.hoisted(() => ({
    canMutateManagedCronEnableSecretMock: vi.fn(),
    getWorkspaceSecretsAccessMock: vi.fn(),
  }));

vi.mock('../access', () => ({
  getWorkspaceSecretsAccess: getWorkspaceSecretsAccessMock,
}));

vi.mock('@/lib/workspace-secrets/managed-cron', () => ({
  canMutateManagedCronEnableSecret: canMutateManagedCronEnableSecretMock,
  isManagedCronEnableSecretName: (name?: string | null) =>
    name?.trim().toUpperCase() === 'MANAGED_CRON_ENABLED',
  MANAGED_CRON_ENABLED_SECRET: 'MANAGED_CRON_ENABLED',
}));

import { DELETE, PUT } from './route';

describe('workspace secret item route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    canMutateManagedCronEnableSecretMock.mockResolvedValue(false);
  });

  it('constrains PUT updates to the resolved workspace id', async () => {
    const maybeSingleMock = vi.fn().mockResolvedValue({
      data: { name: 'EMAIL_RATE_LIMIT_MINUTE' },
      error: null,
    });
    const selectEqWsMock = vi.fn(() => ({
      maybeSingle: maybeSingleMock,
    }));
    const selectEqIdMock = vi.fn(() => ({
      eq: selectEqWsMock,
    }));
    const selectMock = vi.fn(() => ({
      eq: selectEqIdMock,
    }));
    const eqWsMock = vi.fn().mockResolvedValue({ error: null });
    const eqIdMock = vi.fn(() => ({
      eq: eqWsMock,
    }));
    const updateMock = vi.fn(() => ({
      eq: eqIdMock,
    }));
    const fromMock = vi.fn(() => ({
      select: selectMock,
      update: updateMock,
    }));

    getWorkspaceSecretsAccessMock.mockResolvedValue({
      allowed: true,
      db: { from: fromMock },
      resolvedWsId: 'resolved-ws',
    });

    const response = await PUT(
      new Request('http://localhost', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'EMAIL_RATE_LIMIT_MINUTE',
          value: '250',
        }),
      }),
      {
        params: Promise.resolve({
          secretId: 'secret-1',
          wsId: 'friendly-ws',
        }),
      }
    );

    expect(selectMock).toHaveBeenCalledWith('name');
    expect(selectEqIdMock).toHaveBeenCalledWith('id', 'secret-1');
    expect(selectEqWsMock).toHaveBeenCalledWith('ws_id', 'resolved-ws');
    expect(updateMock).toHaveBeenCalledWith({
      name: 'EMAIL_RATE_LIMIT_MINUTE',
      value: '250',
    });
    expect(eqIdMock).toHaveBeenCalledWith('id', 'secret-1');
    expect(eqWsMock).toHaveBeenCalledWith('ws_id', 'resolved-ws');
    expect(response.status).toBe(200);
  });

  it('rejects managed cron enablement updates from non-employee users', async () => {
    const maybeSingleMock = vi.fn().mockResolvedValue({
      data: { name: 'EMAIL_RATE_LIMIT_MINUTE' },
      error: null,
    });
    const selectEqWsMock = vi.fn(() => ({
      maybeSingle: maybeSingleMock,
    }));
    const selectEqIdMock = vi.fn(() => ({
      eq: selectEqWsMock,
    }));
    const selectMock = vi.fn(() => ({
      eq: selectEqIdMock,
    }));
    const updateMock = vi.fn();
    const fromMock = vi.fn(() => ({
      select: selectMock,
      update: updateMock,
    }));

    getWorkspaceSecretsAccessMock.mockResolvedValue({
      allowed: true,
      db: { from: fromMock },
      resolvedWsId: 'resolved-ws',
    });

    const response = await PUT(
      new Request('http://localhost', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'MANAGED_CRON_ENABLED',
          value: 'true',
        }),
      }),
      {
        params: Promise.resolve({
          secretId: 'secret-1',
          wsId: 'friendly-ws',
        }),
      }
    );

    expect(canMutateManagedCronEnableSecretMock).toHaveBeenCalledOnce();
    expect(updateMock).not.toHaveBeenCalled();
    expect(response.status).toBe(403);
  });

  it('constrains DELETE queries to the resolved workspace id', async () => {
    const maybeSingleMock = vi.fn().mockResolvedValue({
      data: { name: 'EMAIL_RATE_LIMIT_MINUTE' },
      error: null,
    });
    const selectEqWsMock = vi.fn(() => ({
      maybeSingle: maybeSingleMock,
    }));
    const selectEqIdMock = vi.fn(() => ({
      eq: selectEqWsMock,
    }));
    const selectMock = vi.fn(() => ({
      eq: selectEqIdMock,
    }));
    const eqWsMock = vi.fn().mockResolvedValue({ error: null });
    const eqIdMock = vi.fn(() => ({
      eq: eqWsMock,
    }));
    const deleteMock = vi.fn(() => ({
      eq: eqIdMock,
    }));
    const fromMock = vi.fn(() => ({
      delete: deleteMock,
      select: selectMock,
    }));

    getWorkspaceSecretsAccessMock.mockResolvedValue({
      allowed: true,
      db: { from: fromMock },
      resolvedWsId: 'resolved-ws',
    });

    const response = await DELETE(new Request('http://localhost'), {
      params: Promise.resolve({
        secretId: 'secret-1',
        wsId: 'friendly-ws',
      }),
    });

    expect(eqIdMock).toHaveBeenCalledWith('id', 'secret-1');
    expect(eqWsMock).toHaveBeenCalledWith('ws_id', 'resolved-ws');
    expect(response.status).toBe(200);
  });

  it('rejects managed cron enablement deletes from non-employee users', async () => {
    const maybeSingleMock = vi.fn().mockResolvedValue({
      data: { name: 'MANAGED_CRON_ENABLED' },
      error: null,
    });
    const selectEqWsMock = vi.fn(() => ({
      maybeSingle: maybeSingleMock,
    }));
    const selectEqIdMock = vi.fn(() => ({
      eq: selectEqWsMock,
    }));
    const selectMock = vi.fn(() => ({
      eq: selectEqIdMock,
    }));
    const deleteMock = vi.fn();
    const fromMock = vi.fn(() => ({
      delete: deleteMock,
      select: selectMock,
    }));

    getWorkspaceSecretsAccessMock.mockResolvedValue({
      allowed: true,
      db: { from: fromMock },
      resolvedWsId: 'resolved-ws',
    });

    const response = await DELETE(new Request('http://localhost'), {
      params: Promise.resolve({
        secretId: 'secret-1',
        wsId: 'friendly-ws',
      }),
    });

    expect(canMutateManagedCronEnableSecretMock).toHaveBeenCalledOnce();
    expect(deleteMock).not.toHaveBeenCalled();
    expect(response.status).toBe(403);
  });
});
