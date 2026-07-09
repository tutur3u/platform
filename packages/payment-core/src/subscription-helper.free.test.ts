import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFreeSubscription } from './subscription-helper';

type ChainResult = { data: unknown; error?: unknown };

function chain(result: ChainResult) {
  const c: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'limit']) {
    c[method] = () => c;
  }
  c.maybeSingle = async () => result;
  return c;
}

const WORKSPACE = {
  creator_id: 'u1',
  deleted: false,
  id: 'ws1',
  personal: false,
};

function makeSupabase(productResult: ChainResult) {
  return {
    from: (table: string) => {
      if (table === 'workspaces') return chain({ data: WORKSPACE });
      return chain({ data: null });
    },
    schema: () => ({
      from: () => chain(productResult),
    }),
  } as never;
}

function makePolar(overrides?: { create?: () => Promise<unknown> }) {
  return {
    subscriptions: {
      create: overrides?.create ?? (async () => ({ id: 'sub-1' })),
      list: async () => ({ result: { items: [] } }),
    },
  } as never;
}

describe('createFreeSubscription free-product guard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reports a lookup failure distinctly (permission/schema error)', async () => {
    const supabase = makeSupabase({
      data: null,
      error: { code: '42501', message: 'permission denied for schema private' },
    });

    const result = await createFreeSubscription(makePolar(), supabase, 'ws1');

    expect(result.status).toBe('error');
    expect(result).toMatchObject({
      message: expect.stringContaining('Free-tier product lookup failed'),
    });
  });

  it('reports a missing free product distinctly', async () => {
    const supabase = makeSupabase({ data: null, error: null });

    const result = await createFreeSubscription(makePolar(), supabase, 'ws1');

    expect(result).toEqual({
      status: 'error',
      message: 'No active free-tier product configured',
    });
  });

  it('creates the subscription when a free product exists', async () => {
    const supabase = makeSupabase({
      data: { id: 'prod-free', price_per_seat: null, pricing_model: 'free' },
      error: null,
    });

    const result = await createFreeSubscription(makePolar(), supabase, 'ws1');

    expect(result.status).toBe('created');
    if (result.status === 'created') {
      expect(result.subscription).toMatchObject({ id: 'sub-1' });
    }
  });
});
