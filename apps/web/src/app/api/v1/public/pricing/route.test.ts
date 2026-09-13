import { beforeEach, describe, expect, it, vi } from 'vitest';
import ids from '../../../../../../../../packages/payment-core/src/polar-workspace-product-ids.json';

const mocks = vi.hoisted(() => ({ read: vi.fn(), admin: vi.fn() }));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));
vi.mock('next/server', async () => {
  const actual =
    await vi.importActual<typeof import('next/server')>('next/server');
  return { ...actual, connection: async () => undefined };
});

import { GET } from './route';

describe('public pricing endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.admin.mockResolvedValue({
      schema: () => ({ from: () => ({ select: () => ({ in: mocks.read }) }) }),
    });
  });
  it('returns only the bound public prices with a bounded shared cache', async () => {
    mocks.read.mockResolvedValue({
      data: Object.entries(ids).map(([key, id]) => ({
        id,
        tier: key.startsWith('plus') ? 'PLUS' : 'PRO',
        archived: false,
        pricing_model: 'seat_based',
        recurring_interval: key.endsWith('year') ? 'year' : 'month',
        price_per_seat: 900,
        private: 'never-public',
      })),
      error: null,
    });
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(Object.keys(body).sort()).toEqual(['currency', 'prices']);
    expect(mocks.read).toHaveBeenCalledWith('id', Object.values(ids));
    expect(response.headers.get('Cache-Control')).toContain('s-maxage=30');
    expect(JSON.stringify(body)).not.toContain('never-public');
  });
  it('does not cache or invent prices when catalog access fails', async () => {
    mocks.read.mockResolvedValue({
      data: null,
      error: { message: 'private database details' },
    });
    const response = await GET();
    expect(response.status).toBe(503);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.text()).not.toContain('private database details');
  });
});
