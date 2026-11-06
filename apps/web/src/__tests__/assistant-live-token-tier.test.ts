import { beforeEach, describe, expect, it, vi } from 'vitest';

// Exercises the real admin tier lookup behind the Live token route so UUID
// canonicalization regressions surface as a denied paid workspace.
const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  createConstrainedLiveToken: vi.fn(),
  isFeatureAvailable: vi.fn(),
  ensureAssistantLiveChat: vi.fn(),
  loadAssistantLiveSeedHistory: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
  resolveAuthenticatedSessionUser: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: mocks.resolveAuthenticatedSessionUser,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
  createClient: mocks.createClient,
}));
vi.mock('@tuturuuu/utils/ai-temp-auth', () => ({
  validateAiTempAuthRequest: async () => ({ status: 'missing' }),
}));
vi.mock('@tuturuuu/utils/workspace-helper', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@tuturuuu/utils/workspace-helper')
  >()),
  normalizeWorkspaceId: mocks.normalizeWorkspaceId,
  verifyWorkspaceMembershipType: mocks.verifyWorkspaceMembershipType,
}));
// The Voice Assistant policy currently admits every tier, so pin a PRO
// requirement to make the resolved tier observable at the route boundary.
vi.mock('@/lib/feature-tiers', () => ({
  isFeatureAvailable: mocks.isFeatureAvailable,
}));
vi.mock('@/lib/live/mira-prompt', () => ({
  buildLiveMiraPrompt: async () => 'prompt',
}));
vi.mock('@/lib/live/assistant-history', () => ({
  ensureAssistantLiveChat: mocks.ensureAssistantLiveChat,
  loadAssistantLiveSeedHistory: mocks.loadAssistantLiveSeedHistory,
}));
vi.mock('@/lib/live/token-builder', () => ({
  createConstrainedLiveToken: mocks.createConstrainedLiveToken,
}));

import { POST } from '@/app/api/v1/assistant/live/token/route';

const canonical = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

function tierAdmin(tier: string) {
  const subscriptions = {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({
      data: [
        {
          ws_id: canonical,
          created_at: '2026-10-01T00:00:00.000Z',
          product_id: 'product',
          status: 'active',
        },
      ],
      error: null,
    }),
  };
  const products = {
    select: vi.fn().mockReturnThis(),
    in: vi
      .fn()
      .mockResolvedValue({ data: [{ id: 'product', tier }], error: null }),
  };
  return {
    from: vi.fn(() => subscriptions),
    schema: vi.fn(() => ({ from: vi.fn(() => products) })),
  };
}

describe('assistant live token tier admission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({ auth: {}, from: vi.fn() });
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com' },
    });
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
    mocks.ensureAssistantLiveChat.mockResolvedValue({ id: 'chat-1' });
    mocks.loadAssistantLiveSeedHistory.mockResolvedValue([]);
    mocks.createConstrainedLiveToken.mockResolvedValue('ephemeral-token');
    mocks.isFeatureAvailable.mockImplementation(
      (_feature: string, tier: string) => tier === 'PRO'
    );
  });

  it.each([canonical, canonical.toUpperCase()])(
    'admits a PRO workspace addressed as %s',
    async (wsId) => {
      // normalizeWorkspaceId returns UUID literals unchanged, preserving case.
      mocks.normalizeWorkspaceId.mockResolvedValue(wsId);
      mocks.createAdminClient.mockResolvedValue(tierAdmin('PRO'));

      const response = await POST(
        new Request('http://localhost/api/v1/assistant/live/token', {
          method: 'POST',
          body: JSON.stringify({ wsId, forceFresh: true }),
        })
      );

      expect(response.status).toBe(200);
      expect(mocks.isFeatureAvailable).toHaveBeenCalledWith(
        'voice_assistant',
        'PRO'
      );
      expect(mocks.createConstrainedLiveToken).toHaveBeenCalledOnce();
    }
  );

  it('still denies a FREE workspace', async () => {
    mocks.normalizeWorkspaceId.mockResolvedValue(canonical.toUpperCase());
    mocks.createAdminClient.mockResolvedValue(tierAdmin('FREE'));

    const response = await POST(
      new Request('http://localhost/api/v1/assistant/live/token', {
        method: 'POST',
        body: JSON.stringify({ wsId: canonical, forceFresh: true }),
      })
    );

    expect(response.status).toBe(403);
    expect(mocks.ensureAssistantLiveChat).not.toHaveBeenCalled();
    expect(mocks.createConstrainedLiveToken).not.toHaveBeenCalled();
  });
});
