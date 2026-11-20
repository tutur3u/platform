import { describe, expect, it, vi } from 'vitest';

const supabase = vi.hoisted(() => ({ createAdminClient: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => supabase);

import {
  defaultLiveEligibilityDeps,
  type LiveEligibilityDeps,
  liveBlockedResponse,
  liveReservationAdmits,
  resolveLiveEligibility,
} from './eligibility';
import { readLiveMintConfig } from './mint-cap';

const userId = '00000000-0000-4000-8000-000000000001';
const personalWs = '00000000-0000-4000-8000-000000000002';

/** Production defaults: no kill-switch variables set. */
const productionConfig = () => readLiveMintConfig({});

function deps(overrides: Partial<LiveEligibilityDeps> = {}) {
  return {
    getTier: vi.fn(async () => 'PRO'),
    getCredits: vi.fn(async () => ({
      packCredits: 0,
      includedRemaining: 20_000,
    })),
    getWorkspace: vi.fn(async () => ({ name: 'Personal', personal: true })),
    readConfig: productionConfig,
    ...overrides,
  } satisfies LiveEligibilityDeps;
}

describe('resolveLiveEligibility', () => {
  it('admits a Pro personal workspace with production defaults', async () => {
    const d = deps();
    const result = await resolveLiveEligibility(
      { userId, billingWsId: personalWs },
      d
    );
    expect(result).toMatchObject({
      eligible: true,
      reason: null,
      isFree: false,
      tier: 'PRO',
      billing: { wsId: personalWs, name: 'Personal', personal: true },
    });
    expect(d.getTier).toHaveBeenCalledWith(personalWs);
    expect(d.getCredits).toHaveBeenCalledWith(personalWs, userId);
  });

  it.each(['PLUS', 'ENTERPRISE'])('admits %s plans', async (tier) => {
    const result = await resolveLiveEligibility(
      { userId, billingWsId: personalWs },
      deps({ getTier: async () => tier })
    );
    expect(result.eligible).toBe(true);
  });

  it('refuses the free tier with plan_required and the paid plans', async () => {
    const d = deps({ getTier: async () => 'FREE' });
    const result = await resolveLiveEligibility(
      { userId, billingWsId: personalWs },
      d
    );
    expect(result).toMatchObject({
      eligible: false,
      reason: 'plan_required',
      isFree: true,
      params: { plans: ['PLUS', 'PRO', 'ENTERPRISE'] },
    });
  });

  it('treats paid credit packs on a free workspace as paid', async () => {
    const result = await resolveLiveEligibility(
      { userId, billingWsId: personalWs },
      deps({
        getTier: async () => 'FREE',
        getCredits: async () => ({ packCredits: 800, includedRemaining: 2500 }),
      })
    );
    expect(result).toMatchObject({ eligible: true, isFree: false });
  });

  it('reports the balance when credits are below the Live minimum', async () => {
    const result = await resolveLiveEligibility(
      { userId, billingWsId: personalWs },
      deps({
        getCredits: async () => ({ packCredits: 20, includedRemaining: 100.7 }),
      })
    );
    expect(result).toMatchObject({
      eligible: false,
      reason: 'credits_exhausted',
      params: { balance: 120, minimumCredits: 500 },
    });
  });

  it('pauses paid Live only behind the paid stop', async () => {
    const result = await resolveLiveEligibility(
      { userId, billingWsId: personalWs },
      deps({
        readConfig: () => readLiveMintConfig({ LIVE_PAID_KILL_SWITCH: 'true' }),
      })
    );
    expect(result).toMatchObject({ eligible: false, reason: 'paused' });
  });

  it('admits free Live only when the free kill switch is off', async () => {
    const result = await resolveLiveEligibility(
      { userId, billingWsId: personalWs },
      deps({
        getTier: async () => 'FREE',
        readConfig: () =>
          readLiveMintConfig({ LIVE_MINT_KILL_SWITCH: 'false' }),
      })
    );
    expect(result).toMatchObject({ eligible: true, isFree: true });
  });

  it.each([
    ['tier', { getTier: async () => Promise.reject(new Error('down')) }],
    ['credits', { getCredits: async () => Promise.reject(new Error('down')) }],
  ] as const)(
    'fails closed when the %s lookup is indeterminate',
    async (_name, override) => {
      const result = await resolveLiveEligibility(
        { userId, billingWsId: personalWs },
        deps(override as Partial<LiveEligibilityDeps>)
      );
      expect(result).toMatchObject({
        eligible: false,
        reason: 'paused',
        tier: 'UNKNOWN',
      });
    }
  );

  it('serializes a block without the workspace id or server text', async () => {
    const result = await resolveLiveEligibility(
      { userId, billingWsId: personalWs },
      deps({ getTier: async () => 'FREE' })
    );
    const response = liveBlockedResponse(result);
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body).toEqual({
      code: 'LIVE_BLOCKED',
      eligible: false,
      reason: 'plan_required',
      tier: 'FREE',
      billing: { name: 'Personal', personal: true },
      params: { plans: ['PLUS', 'PRO', 'ENTERPRISE'] },
    });
  });

  it.each([
    // [included, packs, admitted]
    [600, 0, true],
    [499, 0, false],
    [2500, 300, true],
    // The fixed reservation takes min(2000, included + packs) from the
    // included balance alone, so packs can push the amount past it.
    [600, 1000, false],
    [300, 300, false],
    [0, 0, false],
  ] as const)(
    'mirrors the reservation: included %d + packs %d admits %s',
    (includedRemaining, packCredits, admitted) => {
      expect(liveReservationAdmits({ includedRemaining, packCredits })).toBe(
        admitted
      );
    }
  );

  it('never passes a pre-check the reservation would refuse', async () => {
    const result = await resolveLiveEligibility(
      { userId, billingWsId: personalWs },
      deps({
        getCredits: async () => ({ packCredits: 1000, includedRemaining: 600 }),
      })
    );
    expect(result).toMatchObject({
      eligible: false,
      reason: 'credits_exhausted',
    });
  });
});

describe('default lookups', () => {
  function fakeClient({
    subscriptions = [] as Record<string, unknown>[],
    packs = [] as Record<string, unknown>[],
    balance = [] as Record<string, unknown>[] | null,
  }) {
    const calls: Record<string, unknown[][]> = {};
    const from = (table: string) => {
      const log: unknown[][] = (calls[table] = []);
      const data = table === 'workspace_subscriptions' ? subscriptions : packs;
      const query: Record<string, unknown> = {};
      for (const op of ['select', 'eq', 'in', 'gt', 'order', 'limit']) {
        query[op] = (...args: unknown[]) => {
          log.push([op, ...args]);
          return query;
        };
      }
      query.then = (resolve: (value: unknown) => void) =>
        resolve({ data, error: null });
      return query;
    };
    const rpc = vi.fn(async () => ({ data: balance, error: null }));
    return { client: { from, rpc }, calls, rpc };
  }

  it('reads the reservation balance row and only active packs', async () => {
    const { client, calls, rpc } = fakeClient({
      packs: [{ tokens_remaining: 300 }],
      balance: [{ total_allocated: 400, total_used: 100, bonus_credits: 0 }],
    });
    supabase.createAdminClient.mockResolvedValue(client);
    const credits = await defaultLiveEligibilityDeps.getCredits(
      personalWs,
      userId
    );
    expect(credits).toEqual({ packCredits: 300, includedRemaining: 300 });
    // The same call the reservation makes, so the scope can never drift.
    expect(rpc).toHaveBeenCalledWith('get_or_create_credit_balance', {
      p_ws_id: personalWs,
      p_user_id: userId,
    });
    expect(calls.workspace_credit_pack_purchases).toEqual(
      expect.arrayContaining([
        ['eq', 'status', 'active'],
        ['gt', 'tokens_remaining', 0],
      ])
    );
    expect(calls.workspace_credit_pack_purchases).not.toContainEqual([
      'in',
      'status',
      ['active', 'canceled'],
    ]);
  });

  it('fails closed when the balance row cannot be read', async () => {
    const { client } = fakeClient({ balance: null });
    supabase.createAdminClient.mockResolvedValue(client);
    const result = await resolveLiveEligibility(
      { userId, billingWsId: personalWs },
      {
        ...defaultLiveEligibilityDeps,
        getTier: async () => 'PRO',
        getWorkspace: async () => null,
        readConfig: productionConfig,
      }
    );
    expect(result).toMatchObject({ eligible: false, reason: 'paused' });
  });

  it('treats an active subscription without a product as indeterminate', async () => {
    const { client } = fakeClient({
      subscriptions: [{ product_id: null, created_at: '2026-11-01' }],
    });
    supabase.createAdminClient.mockResolvedValue(client);
    await expect(
      defaultLiveEligibilityDeps.getTier(personalWs)
    ).rejects.toThrow();
    const result = await resolveLiveEligibility(
      { userId, billingWsId: personalWs },
      {
        ...defaultLiveEligibilityDeps,
        getCredits: async () => ({ packCredits: 0, includedRemaining: 9000 }),
        getWorkspace: async () => null,
        readConfig: productionConfig,
      }
    );
    expect(result).toMatchObject({
      eligible: false,
      reason: 'paused',
      tier: 'UNKNOWN',
    });
  });

  it('resolves FREE only when no active subscription exists', async () => {
    const { client } = fakeClient({ subscriptions: [] });
    supabase.createAdminClient.mockResolvedValue(client);
    await expect(defaultLiveEligibilityDeps.getTier(personalWs)).resolves.toBe(
      'FREE'
    );
  });
});
