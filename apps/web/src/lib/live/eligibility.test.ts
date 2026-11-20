import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
}));
vi.mock('@tuturuuu/payment-core', () => ({ getAiCreditsStatus: vi.fn() }));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getWorkspaceTier: vi.fn(),
}));

import {
  type LiveEligibilityDeps,
  liveBlockedResponse,
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
    hasPaidCredits: vi.fn(async () => false),
    getRemainingCredits: vi.fn(async () => 20_000),
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
    expect(d.getRemainingCredits).toHaveBeenCalledWith(personalWs, userId);
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
    expect(d.getRemainingCredits).not.toHaveBeenCalled();
  });

  it('treats paid credit packs on a free workspace as paid', async () => {
    const result = await resolveLiveEligibility(
      { userId, billingWsId: personalWs },
      deps({ getTier: async () => 'FREE', hasPaidCredits: async () => true })
    );
    expect(result).toMatchObject({ eligible: true, isFree: false });
  });

  it('reports the balance when credits are below the Live minimum', async () => {
    const result = await resolveLiveEligibility(
      { userId, billingWsId: personalWs },
      deps({ getRemainingCredits: async () => 120.7 })
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
});
