import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  resolveAuthenticatedSessionUser: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
  getWorkspaceTier: vi.fn(),
  buildLiveMiraPrompt: vi.fn(),
  beginLiveBillingSession: vi.fn(),
  abortLiveBillingSession: vi.fn(),
  createConstrainedLiveToken: vi.fn(),
  readLiveMintConfig: vi.fn(),
  reserveLiveMint: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => mocks);
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => mocks);
vi.mock('@tuturuuu/utils/workspace-helper', () => mocks);
vi.mock('@/lib/live/mira-prompt', () => mocks);
vi.mock('@/lib/live/billing', () => ({
  ...mocks,
  LiveBillingError: class extends Error {},
}));
vi.mock('@/lib/live/token-builder', () => mocks);
// Route tests run the real eligibility decision over the mocked tier and
// mint configuration; credits and workspace naming are fixed fixtures.
vi.mock('@/lib/live/eligibility', async () => {
  const actual = await vi.importActual<typeof import('@/lib/live/eligibility')>(
    '@/lib/live/eligibility'
  );
  return {
    ...actual,
    resolveStrictWorkspaceTier: async (wsId: string) =>
      (await mocks.getWorkspaceTier(wsId, { useAdmin: true })) as string,
    resolveLiveEligibility: (args: { userId: string; billingWsId: string }) =>
      actual.resolveLiveEligibility(args, {
        getTier: async (wsId) =>
          (await mocks.getWorkspaceTier(wsId, { useAdmin: true })) as string,
        getCredits: async () => ({ packCredits: 0, includedRemaining: 10_000 }),
        getWorkspace: async () => ({ name: 'Personal', personal: true }),
        readConfig: () => mocks.readLiveMintConfig(),
      }),
  };
});
vi.mock('@/lib/live/mint-cap', () => ({
  ...mocks,
  LiveMintCapError: class extends Error {
    constructor(
      readonly status: number,
      readonly code: string,
      readonly retryAfter = 60
    ) {
      super(code);
    }
  },
}));
vi.mock('@/lib/live/assistant-tools', () => ({
  ASSISTANT_LIVE_TOOL_CONFIG: {},
  DASHBOARD_LIVE_TOOL_DECLARATIONS: [],
}));
import { LiveMintCapError } from '@/lib/live/mint-cap';
import { POST } from './route';

const actor = '00000000-0000-4000-8000-000000000001';
const accessWs = '00000000-0000-4000-8000-000000000002';
const billingWs = '00000000-0000-4000-8000-000000000003';
const expiresAt = '2026-11-16T17:00:00.000Z';
const config = {
  freeSessionSeconds: 180,
  actorDailyMints: 10,
  dailyBudgetMicroUsd: 50_000_000,
  usdPerMinuteMicroUsd: 36_800,
  actorMaxConcurrent: 1,
  killSwitch: false,
};
function request(extra: Record<string, unknown> = {}) {
  return new Request('https://tuturuuu.com/api/v1/live/token', {
    method: 'POST',
    body: JSON.stringify({
      wsId: accessWs,
      creditSource: 'personal',
      ...extra,
    }),
  }) as NextRequest;
}

// Real route, fixture billing/provider/store boundaries. Redis atomicity and
// provider enforcement require their own qualification.
describe('web Live mint cap integration', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi
        .fn()
        .mockResolvedValue({ data: { id: billingWs }, error: null }),
    };
    mocks.createClient.mockResolvedValue({});
    mocks.createAdminClient.mockResolvedValue({ from: () => query });
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      user: { id: actor },
    });
    mocks.normalizeWorkspaceId.mockResolvedValue(accessWs);
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
    mocks.getWorkspaceTier.mockResolvedValue('FREE');
    mocks.readLiveMintConfig.mockReturnValue(config);
    mocks.reserveLiveMint.mockResolvedValue({
      mintId: 'fixture',
      freeSessionSeconds: 180,
      expiresAt,
      reservedMicroUsd: 110_400,
    });
    mocks.buildLiveMiraPrompt.mockResolvedValue('fixture');
    mocks.beginLiveBillingSession.mockResolvedValue({
      liveSessionId: 'session',
      reservedCredits: 2000,
    });
    mocks.abortLiveBillingSession.mockResolvedValue(undefined);
    mocks.createConstrainedLiveToken.mockResolvedValue('fixture-token');
  });

  it('uses the authoritative pool and exact admitted expiry with FREE resumption disabled', async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.json()).toMatchObject({ expiresAt });
    expect(mocks.getWorkspaceTier).toHaveBeenCalledWith(billingWs, {
      useAdmin: true,
    });
    expect(mocks.reserveLiveMint).toHaveBeenCalledWith({
      actorId: actor,
      isFree: true,
      config,
    });
    expect(mocks.beginLiveBillingSession).toHaveBeenCalledWith(
      expect.objectContaining({ expiresAt, billingWsId: billingWs })
    );
    expect(mocks.createConstrainedLiveToken).toHaveBeenCalledWith(
      expect.objectContaining({
        expiresAt,
        allowResumption: false,
        model: 'gemini-3.8-live',
      })
    );
    expect(mocks.reserveLiveMint.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.beginLiveBillingSession.mock.invocationCallOrder[0]!
    );
  });

  it.each([
    [429, 'FREE_LIVE_DAILY_BUDGET_EXHAUSTED'],
    [429, 'LIVE_MINT_ACTOR_LIMIT'],
    [503, 'LIVE_MINT_DISABLED'],
    [503, 'LIVE_MINT_STORE_UNAVAILABLE'],
  ] as const)(
    'stops %s/%s before provider and allowance work',
    async (status, code) => {
      mocks.reserveLiveMint.mockRejectedValue(
        new LiveMintCapError(status, code, 120)
      );
      const response = await POST(request());
      expect(response.status).toBe(status);
      expect(response.headers.get('Retry-After')).toBe('120');
      expect(await response.json()).toMatchObject({ code });
      expect(mocks.beginLiveBillingSession).not.toHaveBeenCalled();
      expect(mocks.createConstrainedLiveToken).not.toHaveBeenCalled();
    }
  );

  it('refuses the expensive model for FREE before reserving', async () => {
    const response = await POST(request({ mode: 'pro' }));
    expect(response.status).toBe(403);
    expect(mocks.reserveLiveMint).not.toHaveBeenCalled();
    expect(mocks.createConstrainedLiveToken).not.toHaveBeenCalled();
  });

  it('allows paid model selection while still counting the actor mint', async () => {
    mocks.getWorkspaceTier.mockResolvedValue('PRO');
    expect((await POST(request({ mode: 'pro' }))).status).toBe(200);
    expect(mocks.reserveLiveMint).toHaveBeenCalledWith({
      actorId: actor,
      isFree: false,
      config,
    });
  });

  it('does not replay an interrupted provider mint or refund its cap', async () => {
    mocks.createConstrainedLiveToken.mockRejectedValue(
      new Error('interrupted')
    );
    expect((await POST(request())).status).toBe(500);
    expect(mocks.reserveLiveMint).toHaveBeenCalledTimes(1);
    expect(mocks.createConstrainedLiveToken).toHaveBeenCalledTimes(1);
    expect(mocks.abortLiveBillingSession).toHaveBeenCalledWith({
      liveSessionId: 'session',
      userId: actor,
    });
  });
});
