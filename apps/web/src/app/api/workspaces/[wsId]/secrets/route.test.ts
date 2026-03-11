import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getWorkspaceSecretsAccessMock } = vi.hoisted(() => ({
  getWorkspaceSecretsAccessMock: vi.fn(),
}));

vi.mock('./access', () => ({
  getWorkspaceSecretsAccess: getWorkspaceSecretsAccessMock,
}));

import { GET, POST } from './route';

describe('workspace secrets collection route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
