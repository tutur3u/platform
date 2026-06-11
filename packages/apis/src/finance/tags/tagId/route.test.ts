import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  delete: vi.fn(),
  getFinanceRouteContext: vi.fn(),
  update: vi.fn(),
}));

vi.mock('../../request-access', () => ({
  getFinanceRouteContext: (
    ...args: Parameters<typeof mocks.getFinanceRouteContext>
  ) => mocks.getFinanceRouteContext(...args),
}));

describe('finance tag detail route', () => {
  const tagId = '7855d29c-e2e0-48e9-b70c-399335bb7abd';

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.getFinanceRouteContext.mockResolvedValue({
      context: {
        normalizedWsId: 'ws-1',
        permissions: {
          withoutPermission: vi.fn(() => false),
        },
        sbAdmin: {
          from: vi.fn((table: string) => {
            if (table !== 'transaction_tags') {
              throw new Error(`Unexpected table: ${table}`);
            }

            return {
              delete: mocks.delete,
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: {
                        id: tagId,
                        name: 'Tuturuuu',
                        color: '#9ef0ff',
                        description: 'Platform costs',
                      },
                      error: null,
                    }),
                  })),
                })),
              })),
              update: mocks.update,
            };
          }),
        },
      },
    });
  });

  it('returns a tag by id', async () => {
    const { GET } = await import('./route.js');
    const response = await GET(
      new Request(`http://localhost/api/workspaces/ws-1/tags/${tagId}`),
      {
        params: Promise.resolve({
          tagId,
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      id: tagId,
      name: 'Tuturuuu',
      color: '#9ef0ff',
      description: 'Platform costs',
    });
  });

  it('updates tag descriptions', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: tagId,
        description: 'Investment platform costs',
      },
      error: null,
    });
    const select = vi.fn(() => ({ maybeSingle }));
    const secondEq = vi.fn(() => ({ select }));
    const firstEq = vi.fn(() => ({ eq: secondEq }));
    mocks.update.mockReturnValue({ eq: firstEq });

    const { PUT } = await import('./route.js');
    const response = await PUT(
      new Request(`http://localhost/api/workspaces/ws-1/tags/${tagId}`, {
        method: 'PUT',
        body: JSON.stringify({
          description: 'Investment platform costs',
        }),
      }),
      {
        params: Promise.resolve({
          tagId,
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({
      description: 'Investment platform costs',
    });
    expect(firstEq).toHaveBeenCalledWith('id', tagId);
    expect(secondEq).toHaveBeenCalledWith('ws_id', 'ws-1');
  });

  it('deletes tags by id', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: tagId,
      },
      error: null,
    });
    const select = vi.fn(() => ({ maybeSingle }));
    const secondEq = vi.fn(() => ({ select }));
    const firstEq = vi.fn(() => ({ eq: secondEq }));
    mocks.delete.mockReturnValue({ eq: firstEq });

    const { DELETE } = await import('./route.js');
    const response = await DELETE(
      new Request(`http://localhost/api/workspaces/ws-1/tags/${tagId}`, {
        method: 'DELETE',
      }),
      {
        params: Promise.resolve({
          tagId,
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(firstEq).toHaveBeenCalledWith('id', tagId);
    expect(secondEq).toHaveBeenCalledWith('ws_id', 'ws-1');
    await expect(response.json()).resolves.toEqual({ message: 'success' });
  });
});
