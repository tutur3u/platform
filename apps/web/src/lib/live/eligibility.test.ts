import { describe, expect, it, vi } from 'vitest';

const supabase = vi.hoisted(() => ({ createAdminClient: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => supabase);

import {
  defaultLiveEligibilityDeps,
  type LiveEligibilityDeps,
  liveBlockedResponse,
  liveCreditPeriodStart,
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
      includedRemaining: 20_000 as number | null,
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
    expect(d.getCredits).toHaveBeenCalledWith(personalWs, {
      kind: 'workspace',
    });
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
        getCredits: async () => ({ packCredits: 800, includedRemaining: 0 }),
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

  it('leaves credits to the reservation before the period row exists', async () => {
    const result = await resolveLiveEligibility(
      { userId, billingWsId: personalWs },
      deps({
        getCredits: async () => ({ packCredits: 0, includedRemaining: null }),
      })
    );
    expect(result.eligible).toBe(true);
  });

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

  it('reads the actor balance for a FREE subscription with a paid pack', async () => {
    const d = deps({
      getTier: async () => 'FREE',
      getCredits: vi.fn(async () => ({
        packCredits: 300,
        includedRemaining: 250 as number | null,
      })),
    });
    const result = await resolveLiveEligibility(
      { userId, billingWsId: personalWs },
      d
    );
    expect(d.getCredits).toHaveBeenCalledWith(personalWs, {
      kind: 'user',
      userId,
    });
    // 250 actor credits + 300 pack credits clear the 500 minimum.
    expect(result).toMatchObject({ eligible: true, isFree: false });
  });
});

describe('default credit lookup', () => {
  type Call = [string, ...unknown[]];
  function fakeClient(rows: {
    balances: Record<string, unknown>[];
    packs: Record<string, unknown>[];
  }) {
    const calls: Record<string, Call[]> = {};
    const builder = (table: string) => {
      const log: Call[] = (calls[table] = []);
      const filtered = () =>
        table === 'workspace_ai_credit_balances'
          ? rows.balances.filter((row) =>
              log.every(([op, column, value]) =>
                op === 'eq'
                  ? row[column as string] === value
                  : op === 'is'
                    ? row[column as string] === value
                    : true
              )
            )
          : rows.packs;
      const query: Record<string, unknown> = {};
      for (const op of ['select', 'eq', 'is', 'in', 'gt']) {
        query[op] = (...args: unknown[]) => {
          log.push([op, ...args]);
          return query;
        };
      }
      query.maybeSingle = async () => ({
        data: filtered()[0] ?? null,
        error: null,
      });
      query.then = (resolve: (value: unknown) => void) =>
        resolve({ data: filtered(), error: null });
      return query;
    };
    return { client: { from: builder }, calls };
  }

  it('uses the actor row after a mid-period downgrade, not the stale workspace row', async () => {
    const period = liveCreditPeriodStart();
    const { client, calls } = fakeClient({
      balances: [
        // Workspace row left over from the paid part of the month.
        {
          ws_id: personalWs,
          user_id: null,
          period_start: period,
          total_allocated: 0,
          total_used: 0,
          bonus_credits: 0,
        },
        // The actor's own FREE-track row, which the reservation uses.
        {
          ws_id: null,
          user_id: userId,
          period_start: period,
          total_allocated: 400,
          total_used: 100,
          bonus_credits: 0,
        },
      ],
      packs: [{ tokens_remaining: 300 }],
    });
    supabase.createAdminClient.mockResolvedValue(client);
    const credits = await defaultLiveEligibilityDeps.getCredits(personalWs, {
      kind: 'user',
      userId,
    });
    expect(credits).toEqual({ packCredits: 300, includedRemaining: 300 });
    expect(calls.workspace_ai_credit_balances).toEqual(
      expect.arrayContaining([
        ['eq', 'period_start', period],
        ['eq', 'user_id', userId],
        ['is', 'ws_id', null],
      ])
    );
    const result = await resolveLiveEligibility(
      { userId, billingWsId: personalWs },
      {
        ...defaultLiveEligibilityDeps,
        getTier: async () => 'FREE',
        getWorkspace: async () => ({ name: null, personal: true }),
        readConfig: productionConfig,
      }
    );
    // 300 actor + 300 pack: eligible, never a false credits_exhausted.
    expect(result).toMatchObject({ eligible: true, isFree: false });
  });

  it('uses the workspace row on a paid tier', async () => {
    const { client, calls } = fakeClient({ balances: [], packs: [] });
    supabase.createAdminClient.mockResolvedValue(client);
    await defaultLiveEligibilityDeps.getCredits(personalWs, {
      kind: 'workspace',
    });
    expect(calls.workspace_ai_credit_balances).toEqual(
      expect.arrayContaining([
        ['eq', 'ws_id', personalWs],
        ['is', 'user_id', null],
      ])
    );
  });
});
