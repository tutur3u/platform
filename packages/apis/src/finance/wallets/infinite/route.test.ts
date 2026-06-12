import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  handleWalletsGET: vi.fn(),
}));

vi.mock('../route', () => ({
  GET: (...args: Parameters<typeof mocks.handleWalletsGET>) =>
    mocks.handleWalletsGET(...args),
}));

describe('wallets infinite route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.handleWalletsGET.mockResolvedValue(
      NextResponse.json([
        { id: 'cash', name: 'Cash' },
        { id: 'bank-main', name: 'Main Bank' },
        { id: 'bank-backup', name: 'Backup Bank' },
      ])
    );
  });

  it('returns paged wallet data with hasMore and nextOffset', async () => {
    const { GET } = await import('./route.js');
    const response = await GET(
      new Request(
        'http://localhost/api/workspaces/ws-1/wallets/infinite?limit=2&offset=0'
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
        }),
      }
    );

    await expect(response.json()).resolves.toEqual({
      data: [
        { id: 'cash', name: 'Cash' },
        { id: 'bank-main', name: 'Main Bank' },
      ],
      hasMore: true,
      nextOffset: 2,
      totalCount: 3,
    });
  });

  it('searches wallet names before slicing the current page', async () => {
    const { GET } = await import('./route.js');
    const response = await GET(
      new Request(
        'http://localhost/api/workspaces/ws-1/wallets/infinite?limit=1&offset=1&q=bank'
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
        }),
      }
    );

    await expect(response.json()).resolves.toEqual({
      data: [{ id: 'bank-backup', name: 'Backup Bank' }],
      hasMore: false,
      nextOffset: null,
      totalCount: 2,
    });
  });

  it('passes through legacy wallet-list failures', async () => {
    mocks.handleWalletsGET.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    );

    const { GET } = await import('./route.js');
    const response = await GET(
      new Request('http://localhost/api/workspaces/ws-1/wallets/infinite'),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden' });
  });
});
