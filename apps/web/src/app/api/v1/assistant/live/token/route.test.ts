import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  resolveAuthenticatedSessionUser: vi.fn(),
  validateAiTempAuthRequest: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
  resolveWorkspaceIdForPrincipal: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
  getWorkspaceTier: vi.fn(),
  ensureAssistantLiveChat: vi.fn(),
  loadAssistantLiveSeedHistory: vi.fn(),
  buildLiveMiraPrompt: vi.fn(),
  createConstrainedLiveToken: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  readLiveMintConfig: vi.fn(),
  reserveLiveMint: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => mocks);
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => mocks);
vi.mock('@tuturuuu/utils/ai-temp-auth', () => mocks);
vi.mock('@tuturuuu/utils/workspace-helper', () => mocks);
vi.mock('@/lib/live/assistant-history', () => mocks);
vi.mock('@/lib/live/mira-prompt', () => mocks);
vi.mock('@/lib/live/mint-cap', () => ({
  readLiveMintConfig: mocks.readLiveMintConfig,
  reserveLiveMint: mocks.reserveLiveMint,
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
vi.mock('@/lib/live/token-builder', () => ({
  createConstrainedLiveToken: mocks.createConstrainedLiveToken,
  LIVE_TOKEN_LIFETIME_MS: 300_000,
}));
vi.mock('@/lib/live/assistant-tools', () => ({
  ASSISTANT_LIVE_MODEL: 'gemini-3.1-flash-live-preview',
  ASSISTANT_LIVE_TOOL_CONFIG: {},
  ASSISTANT_LIVE_TOOL_DECLARATIONS: [],
}));
vi.mock('@/lib/live/canonical-tool-bridge', async () => {
  const { z } = await import('zod');
  return {
    CANONICAL_LIVE_TOOL_DECLARATIONS: [],
    liveToolProtocolSchema: z.enum(['legacy', 'canonical-v1']),
  };
});

import { POST } from './route';
import { LiveMintCapError } from '@/lib/live/mint-cap';

const actor = '00000000-0000-4000-8000-000000000001';
const accessWs = '00000000-0000-4000-8000-000000000002';
const billingWs = '00000000-0000-4000-8000-000000000003';
const liveSessionId = '00000000-0000-4000-8000-000000000004';
const chatId = '00000000-0000-4000-8000-000000000005';

function query(data: unknown) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
  };
}

function request(extra: Record<string, unknown> = {}) {
  return new Request('https://tuturuuu.com/api/v1/assistant/live/token', {
    method: 'POST',
    body: JSON.stringify({ wsId: accessWs, chatId, ...extra }),
  });
}

let personalWorkspace = query({ id: billingWs });
let storedContext = query(null);

// The route and begin/abort billing helpers are real. The database/provider
// boundaries are mocked; these checks do not prove full-chain credit accounting.
describe('mobile Live token shared-allowance admission', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    personalWorkspace = query({ id: billingWs });
    storedContext = query(null);
    mocks.from.mockImplementation((table: string) =>
      table === 'workspaces' ? personalWorkspace : storedContext
    );
    const client = {
      from: mocks.from,
      schema: () => ({ rpc: mocks.rpc }),
    };
    mocks.createClient.mockResolvedValue(client);
    mocks.createAdminClient.mockResolvedValue(client);
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      user: { id: actor, email: null },
    });
    mocks.validateAiTempAuthRequest.mockResolvedValue({ status: 'missing' });
    mocks.normalizeWorkspaceId.mockResolvedValue(accessWs);
    mocks.resolveWorkspaceIdForPrincipal.mockResolvedValue(accessWs);
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
    mocks.getWorkspaceTier.mockResolvedValue('FREE');
    mocks.readLiveMintConfig.mockReturnValue({
      freeSessionSeconds: 180,
      actorDailyMints: 10,
      dailyBudgetMicroUsd: 50_000_000,
      usdPerMinuteMicroUsd: 36_800,
      killSwitch: false,
      actorMaxConcurrent: 1,
    });
    mocks.reserveLiveMint.mockResolvedValue({
      mintId: 'mint-1',
      freeSessionSeconds: 180,
      expiresAt: new Date(Date.now() + 180_000).toISOString(),
    });
    mocks.ensureAssistantLiveChat.mockResolvedValue({ id: chatId });
    mocks.loadAssistantLiveSeedHistory.mockResolvedValue([]);
    mocks.buildLiveMiraPrompt.mockResolvedValue('Live system instructions');
    mocks.rpc.mockImplementation(async (name: string) => ({
      data: [
        name === 'begin_ai_live_session'
          ? {
              success: true,
              live_session_id: liveSessionId,
              reservation_id: '00000000-0000-4000-8000-000000000006',
              reserved_credits: 2000,
            }
          : { success: true, closed: true },
      ],
      error: null,
    }));
    mocks.createConstrainedLiveToken.mockImplementation(async () => {
      expect(mocks.rpc).toHaveBeenCalledWith(
        'begin_ai_live_session',
        expect.objectContaining({
          p_user_id: actor,
          p_access_ws_id: accessWs,
          p_billing_ws_id: billingWs,
        })
      );
      return 'synthetic-provider-boundary-token';
    });
  });

  it.each(['FREE', 'PRO'])(
    'defaults omitted model to Flash for %s',
    async (tier) => {
      mocks.getWorkspaceTier.mockResolvedValue(tier);
      expect((await POST(request())).status).toBe(200);
      expect(mocks.createConstrainedLiveToken).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'gemini-3.8-live' })
      );
    }
  );

  it('admits FREE through the real server policy before minting a token', async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.json()).toMatchObject({
      liveSessionId,
      reservedCredits: 2000,
      chatId,
      scopeKey: expect.any(String),
      expiresAt: expect.any(String),
    });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it.each(['INSUFFICIENT_CREDITS', 'CREDITS_EXHAUSTED'])(
    'rejects %s from the actual admission helper before provider work',
    async (errorCode) => {
      mocks.rpc.mockResolvedValue({
        data: [{ success: false, error_code: errorCode }],
        error: null,
      });
      const response = await POST(request());
      expect(response.status).toBe(402);
      expect(await response.json()).toMatchObject({ code: errorCode });
      expect(mocks.createConstrainedLiveToken).not.toHaveBeenCalled();
      expect(mocks.rpc).toHaveBeenCalledTimes(1);
    }
  );

  it.each(['MODEL_NOT_ALLOWED', 'FEATURE_NOT_ALLOWED'])(
    'does not mint provider credentials when allowance rejects %s',
    async (errorCode) => {
      mocks.rpc.mockResolvedValue({
        data: [{ success: false, error_code: errorCode }],
        error: null,
      });
      expect((await POST(request())).status).toBe(403);
      expect(mocks.createConstrainedLiveToken).not.toHaveBeenCalled();
    }
  );

  it('resolves the actor-owned personal workspace, ignoring caller billing input', async () => {
    expect(
      (await POST(request({ billingWsId: accessWs, creditWsId: accessWs })))
        .status
    ).toBe(200);
    expect(personalWorkspace.eq).toHaveBeenCalledWith('creator_id', actor);
    expect(personalWorkspace.eq).toHaveBeenCalledWith('personal', true);
    expect(personalWorkspace.or).toHaveBeenCalledWith(
      'deleted.is.null,deleted.eq.false'
    );
    expect(personalWorkspace.eq).toHaveBeenCalledWith(
      'workspace_members.user_id',
      actor
    );
    expect(personalWorkspace.eq).toHaveBeenCalledWith(
      'workspace_members.type',
      'MEMBER'
    );
  });

  it('fails closed when no owned personal pool exists', async () => {
    personalWorkspace.maybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });
    const response = await POST(request());
    expect(response.status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.createConstrainedLiveToken).not.toHaveBeenCalled();
  });

  it('does not reserve or mint without an authenticated actor', async () => {
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({ user: null });
    expect((await POST(request())).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.createConstrainedLiveToken).not.toHaveBeenCalled();
  });

  it('does not reserve or mint for a revoked temporary session', async () => {
    mocks.validateAiTempAuthRequest.mockResolvedValue({ status: 'revoked' });
    expect((await POST(request())).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.createConstrainedLiveToken).not.toHaveBeenCalled();
  });

  it('fails closed when the admission RPC fails', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: 'unavailable' } });
    expect((await POST(request())).status).toBe(500);
    expect(mocks.createConstrainedLiveToken).not.toHaveBeenCalled();
  });

  it('aborts a new reservation when token provisioning fails', async () => {
    mocks.createConstrainedLiveToken.mockRejectedValue(
      new Error('Unavailable')
    );
    expect((await POST(request())).status).toBe(502);
    expect(mocks.rpc).toHaveBeenLastCalledWith(
      'settle_ai_live_session',
      expect.objectContaining({
        p_user_id: actor,
        p_live_session_id: liveSessionId,
        p_close: true,
        p_sequence: 0,
        p_usage: expect.objectContaining({
          inputAudioTokens: 0,
          outputAudioTokens: 0,
        }),
      })
    );
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });

  it('does not reserve for another actor through a scoped temporary session', async () => {
    mocks.validateAiTempAuthRequest.mockResolvedValue({
      status: 'valid',
      context: { user: { id: actor }, wsId: billingWs },
    });
    expect((await POST(request())).status).toBe(403);
    expect(mocks.verifyWorkspaceMembershipType).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.createConstrainedLiveToken).not.toHaveBeenCalled();
  });

  it.each(['missing', 'lookup_failed'])(
    'does not charge before workspace membership succeeds (%s)',
    async (reason) => {
      mocks.verifyWorkspaceMembershipType.mockResolvedValue(
        reason === 'lookup_failed'
          ? { ok: false, error: 'membership_lookup_failed' }
          : { ok: false }
      );
      expect((await POST(request())).status).toBe(
        reason === 'lookup_failed' ? 500 : 403
      );
      expect(mocks.rpc).not.toHaveBeenCalled();
      expect(mocks.createConstrainedLiveToken).not.toHaveBeenCalled();
    }
  );

  it('does not reserve before required history is available', async () => {
    mocks.loadAssistantLiveSeedHistory.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(500);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.createConstrainedLiveToken).not.toHaveBeenCalled();
  });

  it('performs one admission for a new token even when context can resume', async () => {
    mocks.getWorkspaceTier.mockResolvedValue('PRO');
    storedContext.maybeSingle.mockResolvedValue({
      data: { session_handle: 'synthetic-resumption-context' },
      error: null,
    });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.json()).toMatchObject({
      sessionHandle: 'synthetic-resumption-context',
      liveSessionId,
    });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.loadAssistantLiveSeedHistory).not.toHaveBeenCalled();
  });

  it('never treats a resumption handle as allowance admission', async () => {
    mocks.getWorkspaceTier.mockResolvedValue('PRO');
    storedContext.maybeSingle.mockResolvedValue({
      data: { session_handle: 'synthetic-resumption-context' },
      error: null,
    });
    mocks.rpc.mockResolvedValue({
      data: [{ success: false, error_code: 'CREDITS_EXHAUSTED' }],
      error: null,
    });
    expect((await POST(request())).status).toBe(402);
    expect(mocks.createConstrainedLiveToken).not.toHaveBeenCalled();
  });

  it.each([
    [429, 'FREE_LIVE_DAILY_BUDGET_EXHAUSTED'],
    [503, 'LIVE_MINT_DISABLED'],
    [503, 'LIVE_MINT_STORE_UNAVAILABLE'],
  ] as const)(
    'denies cap failure %s/%s before allowance or provider work',
    async (status, code) => {
      mocks.reserveLiveMint.mockRejectedValue(
        new LiveMintCapError(status, code, 90)
      );
      const response = await POST(request());
      expect(response.status).toBe(status);
      expect(response.headers.get('Retry-After')).toBe('90');
      expect(mocks.ensureAssistantLiveChat).not.toHaveBeenCalled();
      expect(await response.json()).toMatchObject({ code });
      expect(mocks.rpc).not.toHaveBeenCalled();
      expect(mocks.createConstrainedLiveToken).not.toHaveBeenCalled();
    }
  );

  it('refuses FREE resumption and uses the admitted expiry', async () => {
    storedContext.maybeSingle.mockResolvedValue({
      data: { session_handle: 'must-not-resume' },
      error: null,
    });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.json()).toMatchObject({ sessionHandle: null });
    expect(storedContext.maybeSingle).not.toHaveBeenCalled();
    expect(mocks.createConstrainedLiveToken).toHaveBeenCalledWith(
      expect.objectContaining({
        allowResumption: false,
        expiresAt: expect.any(String),
      })
    );
    expect(mocks.reserveLiveMint).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: actor, isFree: true })
    );
    expect(mocks.reserveLiveMint.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.createConstrainedLiveToken.mock.invocationCallOrder[0]!
    );
  });

  it('uses billing-pool tier for the FREE model allowlist, not access tier', async () => {
    mocks.getWorkspaceTier.mockImplementation(async (wsId: string) =>
      wsId === billingWs ? 'FREE' : 'PRO'
    );
    expect(
      (await POST(request({ model: 'gemini-3.8-live-extended-thinking' })))
        .status
    ).toBe(403);
    expect(mocks.reserveLiveMint).not.toHaveBeenCalled();
    expect(mocks.createConstrainedLiveToken).not.toHaveBeenCalled();
  });

  it('does not retry or refund the mint admission after provider interruption', async () => {
    mocks.createConstrainedLiveToken.mockRejectedValue(
      new Error('interrupted')
    );
    expect((await POST(request())).status).toBe(502);
    expect(mocks.reserveLiveMint).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenLastCalledWith(
      'settle_ai_live_session',
      expect.objectContaining({ p_close: true })
    );
  });
});
