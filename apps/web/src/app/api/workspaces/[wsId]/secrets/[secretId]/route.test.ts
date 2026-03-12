import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getWorkspaceSecretsAccessMock } = vi.hoisted(() => ({
  getWorkspaceSecretsAccessMock: vi.fn(),
}));

vi.mock('../access', () => ({
  getWorkspaceSecretsAccess: getWorkspaceSecretsAccessMock,
}));

import { DELETE, PUT } from './route';

describe('workspace secret item route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('constrains PUT updates to the resolved workspace id', async () => {
    const eqWsMock = vi.fn().mockResolvedValue({ error: null });
    const eqIdMock = vi.fn(() => ({
      eq: eqWsMock,
    }));
    const updateMock = vi.fn(() => ({
      eq: eqIdMock,
    }));
    const fromMock = vi.fn(() => ({
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

    expect(updateMock).toHaveBeenCalledWith({
      name: 'EMAIL_RATE_LIMIT_MINUTE',
      value: '250',
    });
    expect(eqIdMock).toHaveBeenCalledWith('id', 'secret-1');
    expect(eqWsMock).toHaveBeenCalledWith('ws_id', 'resolved-ws');
    expect(response.status).toBe(200);
  });

  it('constrains DELETE queries to the resolved workspace id', async () => {
    const eqWsMock = vi.fn().mockResolvedValue({ error: null });
    const eqIdMock = vi.fn(() => ({
      eq: eqWsMock,
    }));
    const deleteMock = vi.fn(() => ({
      eq: eqIdMock,
    }));
    const fromMock = vi.fn(() => ({
      delete: deleteMock,
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
});
