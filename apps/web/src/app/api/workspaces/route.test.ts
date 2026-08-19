import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  createClient: vi.fn(),
  firstOrder: vi.fn(),
  secondOrder: vi.fn(),
}));

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return { ...actual, connection: mocks.connection };
});

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: mocks.createClient,
}));

import { GET, HEAD } from './route';

describe('workspaces route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connection.mockResolvedValue(undefined);
    mocks.secondOrder.mockResolvedValue({
      data: [{ id: 'workspace-id', workspaces: { name: 'Workspace' } }],
      error: null,
    });
    mocks.firstOrder.mockReturnValue({ order: mocks.secondOrder });
    mocks.createClient.mockResolvedValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({ order: mocks.firstOrder })),
      })),
    });
  });

  it('opts into request-time rendering before creating the Supabase client', async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(mocks.connection).toHaveBeenCalledOnce();
    expect(mocks.connection.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.createClient.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
    );
    await expect(response.json()).resolves.toEqual([
      {
        color: 'bg-blue-500',
        id: 'workspace-id',
        name: 'Workspace',
      },
    ]);
  });

  it('preserves the GET status and headers for HEAD without a body', async () => {
    const response = await HEAD();

    expect(response).toBeDefined();
    if (!response) throw new Error('Expected HEAD response');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    await expect(response.text()).resolves.toBe('');
  });

  it('returns the established error response when the query fails', async () => {
    mocks.secondOrder.mockResolvedValue({
      data: null,
      error: new Error('nope'),
    });

    const response = await GET();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      message: 'Error fetching workspaces',
    });
  });
});
