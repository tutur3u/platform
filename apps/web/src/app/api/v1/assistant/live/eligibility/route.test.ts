import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  resolveAuthenticatedSessionUser: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
  resolveMobileLiveBillingWorkspace: vi.fn(),
  getTier: vi.fn(),
  hasPaidCredits: vi.fn(),
  getRemainingCredits: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: mocks.createClient,
  createAdminClient: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => mocks);
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: mocks.normalizeWorkspaceId,
  verifyWorkspaceMembershipType: mocks.verifyWorkspaceMembershipType,
  getWorkspaceTier: vi.fn(),
}));
vi.mock('@tuturuuu/payment-core', () => ({ getAiCreditsStatus: vi.fn() }));
vi.mock('@/lib/live/mobile-billing', () => ({
  resolveMobileLiveBillingWorkspace: mocks.resolveMobileLiveBillingWorkspace,
}));
vi.mock('@/lib/live/eligibility', async () => {
  const actual = await vi.importActual<typeof import('@/lib/live/eligibility')>(
    '@/lib/live/eligibility'
  );
  const { readLiveMintConfig } = await vi.importActual<
    typeof import('@/lib/live/mint-cap')
  >('@/lib/live/mint-cap');
  return {
    ...actual,
    resolveLiveEligibility: (args: { userId: string; billingWsId: string }) =>
      actual.resolveLiveEligibility(args, {
        getTier: mocks.getTier,
        hasPaidCredits: mocks.hasPaidCredits,
        getRemainingCredits: mocks.getRemainingCredits,
        getWorkspace: async () => ({ name: null, personal: true }),
        // Production defaults: no kill-switch variables set.
        readConfig: () => readLiveMintConfig({}),
      }),
  };
});

import { POST } from './route';

const actor = '00000000-0000-4000-8000-000000000001';
const accessWs = '00000000-0000-4000-8000-000000000002';
const personalWs = '00000000-0000-4000-8000-000000000003';

const post = (body: unknown) =>
  POST(
    new Request('https://tuturuuu.com/api/v1/assistant/live/eligibility', {
      method: 'POST',
      body: JSON.stringify(body),
    }) as never
  );

describe('mobile Live eligibility pre-check', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.createClient.mockResolvedValue({});
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      user: { id: actor },
    });
    mocks.normalizeWorkspaceId.mockResolvedValue(accessWs);
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
    mocks.resolveMobileLiveBillingWorkspace.mockResolvedValue(personalWs);
    mocks.hasPaidCredits.mockResolvedValue(false);
    mocks.getRemainingCredits.mockResolvedValue(9000);
  });

  it('admits a Pro personal workspace, billed to the personal pool', async () => {
    mocks.getTier.mockResolvedValue('PRO');
    const response = await post({ wsId: accessWs });
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, max-age=30');
    expect(await response.json()).toEqual({
      eligible: true,
      reason: null,
      tier: 'PRO',
      billing: { name: null, personal: true },
      params: { plans: ['PLUS', 'PRO', 'ENTERPRISE'] },
    });
    expect(mocks.resolveMobileLiveBillingWorkspace).toHaveBeenCalledWith(actor);
    expect(mocks.getTier).toHaveBeenCalledWith(personalWs);
  });

  it('reports plan_required for a free personal workspace', async () => {
    mocks.getTier.mockResolvedValue('FREE');
    const body = await (await post({ wsId: accessWs })).json();
    expect(body).toMatchObject({ eligible: false, reason: 'plan_required' });
  });

  it('reports role_not_allowed for a non-member access workspace', async () => {
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: false });
    const body = await (await post({ wsId: accessWs })).json();
    expect(body).toMatchObject({ eligible: false, reason: 'role_not_allowed' });
    expect(mocks.resolveMobileLiveBillingWorkspace).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated request', async () => {
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({ user: null });
    expect((await post({ wsId: accessWs })).status).toBe(401);
  });
});
