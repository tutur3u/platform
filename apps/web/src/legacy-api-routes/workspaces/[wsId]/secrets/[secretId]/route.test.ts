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

vi.mock('../access', () => ({
  getWorkspaceSecretsAccess: getWorkspaceSecretsAccessMock,
}));

vi.mock('@/lib/workspace-secrets/managed-cron', () => ({
  canMutateManagedCronEnableSecret: canMutateManagedCronEnableSecretMock,
  createManagedCronSecretAdminClient: createManagedCronSecretAdminClientMock,
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

  function mockExistingSecretLookup(name: string) {
    const maybeSingleMock = vi.fn().mockResolvedValue({
      data: { name },
      error: null,
    });
    const selectMock = vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle: maybeSingleMock })),
      })),
    }));
    const userUpdateMock = vi.fn();
    const userDeleteMock = vi.fn();
    getWorkspaceSecretsAccessMock.mockResolvedValue({
      allowed: true,
      db: {
        from: vi.fn(() => ({
          delete: userDeleteMock,
          select: selectMock,
          update: userUpdateMock,
        })),
      },
      resolvedWsId: 'resolved-ws',
    });
    return { userDeleteMock, userUpdateMock };
  }

  function mockAdminMutation(method: 'delete' | 'update') {
    const eqWsMock = vi.fn().mockResolvedValue({ error: null });
    const eqIdMock = vi.fn(() => ({ eq: eqWsMock }));
    const mutationMock = vi.fn(() => ({ eq: eqIdMock }));
    const adminFromMock = vi.fn(() => ({ [method]: mutationMock }));
    createManagedCronSecretAdminClientMock.mockResolvedValue({
      from: adminFromMock,
    });
    return { adminFromMock, eqIdMock, eqWsMock, mutationMock };
  }

  it('writes verified-staff renames to managed cron with the service role', async () => {
    canMutateManagedCronEnableSecretMock.mockResolvedValue(true);
    const { userUpdateMock } = mockExistingSecretLookup(
      'EMAIL_RATE_LIMIT_MINUTE'
    );
    const { adminFromMock, eqIdMock, eqWsMock, mutationMock } =
      mockAdminMutation('update');

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
    expect(adminFromMock).toHaveBeenCalledWith('workspace_secrets');
    expect(mutationMock).toHaveBeenCalledWith({
      name: 'MANAGED_CRON_ENABLED',
      value: 'true',
    });
    expect(eqIdMock).toHaveBeenCalledWith('id', 'secret-1');
    expect(eqWsMock).toHaveBeenCalledWith('ws_id', 'resolved-ws');
    expect(userUpdateMock).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
  });

  it('writes verified-staff managed cron deletes with the service role', async () => {
    canMutateManagedCronEnableSecretMock.mockResolvedValue(true);
    const { userDeleteMock } = mockExistingSecretLookup('MANAGED_CRON_ENABLED');
    const { adminFromMock, eqIdMock, eqWsMock, mutationMock } =
      mockAdminMutation('delete');

    const response = await DELETE(new Request('http://localhost'), {
      params: Promise.resolve({
        secretId: 'secret-1',
        wsId: 'friendly-ws',
      }),
    });

    expect(canMutateManagedCronEnableSecretMock).toHaveBeenCalledOnce();
    expect(adminFromMock).toHaveBeenCalledWith('workspace_secrets');
    expect(mutationMock).toHaveBeenCalledOnce();
    expect(eqIdMock).toHaveBeenCalledWith('id', 'secret-1');
    expect(eqWsMock).toHaveBeenCalledWith('ws_id', 'resolved-ws');
    expect(userDeleteMock).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
  });

  it('keeps other secret names on the access client', async () => {
    const { userDeleteMock } = mockExistingSecretLookup(
      'EMAIL_RATE_LIMIT_MINUTE'
    );
    userDeleteMock.mockReturnValue({
      eq: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })),
    });

    const response = await DELETE(new Request('http://localhost'), {
      params: Promise.resolve({
        secretId: 'secret-1',
        wsId: 'friendly-ws',
      }),
    });

    expect(canMutateManagedCronEnableSecretMock).not.toHaveBeenCalled();
    expect(createManagedCronSecretAdminClientMock).not.toHaveBeenCalled();
    expect(userDeleteMock).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
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
      const response = await PUT(
        new Request('http://localhost', {
          method: 'PUT',
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
    const response = await PUT(
      new Request('http://localhost', {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ wsId: 'friendly-ws', secretId: 'secret-1' }) }
    );
    expect(response.status).toBe(400);
    expect(createManagedCronSecretAdminClientMock).not.toHaveBeenCalled();
  });
  it('rejects a workspace move while renaming an existing reserved secret', async () => {
    canMutateManagedCronEnableSecretMock.mockResolvedValue(true);
    const { userUpdateMock } = mockExistingSecretLookup('MANAGED_CRON_ENABLED');
    const { mutationMock } = mockAdminMutation('update');
    const response = await PUT(
      new Request('http://localhost', {
        method: 'PUT',
        body: JSON.stringify({
          name: 'OTHER',
          value: 'true',
          ws_id: 'other-workspace',
        }),
      }),
      { params: Promise.resolve({ wsId: 'friendly-ws', secretId: 'secret-1' }) }
    );
    expect(response.status).toBe(400);
    expect(userUpdateMock).not.toHaveBeenCalled();
    expect(mutationMock).not.toHaveBeenCalled();
    expect(createManagedCronSecretAdminClientMock).not.toHaveBeenCalled();
  });

  it('keeps a valid edit of an existing reserved secret scoped to its workspace', async () => {
    canMutateManagedCronEnableSecretMock.mockResolvedValue(true);
    const { userUpdateMock } = mockExistingSecretLookup('MANAGED_CRON_ENABLED');
    const { mutationMock, eqIdMock, eqWsMock } = mockAdminMutation('update');
    const response = await PUT(
      new Request('http://localhost', {
        method: 'PUT',
        body: JSON.stringify({ name: 'MANAGED_CRON_ENABLED', value: 'false' }),
      }),
      { params: Promise.resolve({ wsId: 'friendly-ws', secretId: 'secret-1' }) }
    );
    expect(response.status).toBe(200);
    expect(mutationMock).toHaveBeenCalledWith({
      name: 'MANAGED_CRON_ENABLED',
      value: 'false',
    });
    expect(eqIdMock).toHaveBeenCalledWith('id', 'secret-1');
    expect(eqWsMock).toHaveBeenCalledWith('ws_id', 'resolved-ws');
    expect(userUpdateMock).not.toHaveBeenCalled();
  });
});
