import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFreeSubscription,
  QA_TEST_SUBSCRIPTION_PREFIX,
} from './subscription-helper';

type Result = { data: unknown; error?: unknown };

function chain(result: Result) {
  const c: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'limit']) c[method] = () => c;
  c.maybeSingle = async () => result;
  return c;
}

/** A query builder that resolves when awaited, like PostgREST's. */
function awaitable(result: Result) {
  const c: Record<string, unknown> = {};
  for (const method of ['select', 'eq']) c[method] = () => c;
  // biome-ignore lint/suspicious/noThenProperty: mimics a thenable query builder
  c.then = (resolve: (value: Result) => unknown) => resolve(result);
  return c;
}

function makeSupabase(subscriptions: Result) {
  const tables: string[] = [];
  return {
    supabase: {
      from: (table: string) => {
        tables.push(table);
        if (table === 'workspaces')
          return chain({
            data: {
              creator_id: 'u1',
              deleted: false,
              id: 'ws1',
              personal: true,
            },
          });
        if (table === 'workspace_subscriptions')
          return awaitable(subscriptions);
        return chain({ data: null });
      },
      schema: () => ({
        from: () =>
          chain({
            data: { id: 'prod-free', pricing_model: 'free' },
            error: null,
          }),
      }),
    } as never,
    tables,
  };
}

function makePolar() {
  const create = vi.fn(async () => ({ id: 'sub-free' }));
  return {
    create,
    polar: {
      subscriptions: { create, list: async () => ({ result: { items: [] } }) },
    } as never,
  };
}

describe('createFreeSubscription with QA test tier grants', () => {
  beforeEach(() => vi.clearAllMocks());

  it('skips a workspace whose active subscription is a QA tier grant', async () => {
    const { polar, create } = makePolar();
    const { supabase } = makeSupabase({
      data: [{ polar_subscription_id: `${QA_TEST_SUBSCRIPTION_PREFIX}abc` }],
      error: null,
    });

    const result = await createFreeSubscription(polar, supabase, 'ws1');

    expect(result).toEqual({
      status: 'error',
      message: 'A QA test subscription manages this workspace',
      reason: 'qa_managed',
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('still provisions Free when no QA grant is active', async () => {
    const { polar, create } = makePolar();
    const { supabase, tables } = makeSupabase({
      data: [{ polar_subscription_id: 'polar-real-id' }],
      error: null,
    });

    const result = await createFreeSubscription(polar, supabase, 'ws1');

    expect(result.status).toBe('created');
    expect(create).toHaveBeenCalledOnce();
    expect(tables).toContain('workspace_subscriptions');
  });

  it('provisions Free for a workspace with no active subscription rows', async () => {
    const { polar, create } = makePolar();
    const { supabase } = makeSupabase({ data: [], error: null });

    expect((await createFreeSubscription(polar, supabase, 'ws1')).status).toBe(
      'created'
    );
    expect(create).toHaveBeenCalledOnce();
  });

  it('fails closed when the QA grant lookup fails', async () => {
    const { polar, create } = makePolar();
    const { supabase } = makeSupabase({
      data: null,
      error: { message: 'db down' },
    });

    const result = await createFreeSubscription(polar, supabase, 'ws1');

    expect(result).toEqual({
      status: 'error',
      message:
        'Subscription status is unavailable. Please retry before creating a subscription.',
    });
    expect(create).not.toHaveBeenCalled();
  });
});
