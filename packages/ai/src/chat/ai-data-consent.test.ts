import { beforeEach, describe, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({ schema: () => ({ rpc: f.rpc }) }),
}));

import {
  AI_DATA_CONSENT_POLICY_VERSION,
  enforceAiDataConsent,
  hasAiDataConsent,
  requiresAiDataConsent,
} from './ai-data-consent';
import { AI_CONSENT_REQUIRED_SCOPE } from '@tuturuuu/utils/ai-consent-session';
import { createAppCoordinationToken } from '@tuturuuu/utils/app-coordination-token';

const req = (authorization?: string) =>
  new Request('https://test/api/ai/chat', {
    headers: authorization ? { authorization } : {},
  });

describe('Mira AI data consent gate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('applies to native bearer clients only', () => {
    expect(requiresAiDataConsent(req('Bearer eyJhbGciOi'))).toBe(true);
    expect(requiresAiDataConsent(req('bearer opaque-ai-token'))).toBe(true);
    expect(requiresAiDataConsent(req())).toBe(false);
    expect(requiresAiDataConsent(req('Bearer ttr_app_abc'))).toBe(false);
  });

  it('treats a missing, false or failed lookup as no consent', async () => {
    f.rpc.mockResolvedValueOnce({ data: null, error: null });
    expect(await hasAiDataConsent('u1')).toBe(false);
    f.rpc.mockResolvedValueOnce({ data: false, error: null });
    expect(await hasAiDataConsent('u1')).toBe(false);
    f.rpc.mockResolvedValueOnce({ data: true, error: { code: '57014' } });
    expect(await hasAiDataConsent('u1')).toBe(false);
    f.rpc.mockRejectedValueOnce(new Error('network'));
    expect(await hasAiDataConsent('u1')).toBe(false);
    f.rpc.mockResolvedValueOnce({ data: true, error: null });
    expect(await hasAiDataConsent('u1')).toBe(true);
    expect(f.rpc).toHaveBeenLastCalledWith('has_ai_data_consent', {
      p_user_id: 'u1',
      p_policy_version: AI_DATA_CONSENT_POLICY_VERSION,
    });
  });

  it('refuses native requests without consent with a stable code', async () => {
    f.rpc.mockResolvedValue({ data: false, error: null });
    const refusal = await enforceAiDataConsent(req('Bearer t'), 'u1');
    expect(refusal?.status).toBe(403);
    expect(await refusal?.json()).toEqual({
      code: 'ai_consent_required',
      message: 'ai_consent_required',
    });
  });

  it('passes consented native requests and never checks browser ones', async () => {
    f.rpc.mockResolvedValue({ data: true, error: null });
    expect(await enforceAiDataConsent(req('Bearer t'), 'u1')).toBeNull();
    f.rpc.mockClear();
    expect(await enforceAiDataConsent(req(), 'u1')).toBeNull();
    expect(f.rpc).not.toHaveBeenCalled();
  });

  it('applies to app sessions stamped consent-required', async () => {
    vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'test-secret'.repeat(4));
    const appSession = (scopes: string[]) =>
      createAppCoordinationToken({
        scopes: ['internal-app:session', ...scopes],
        targetApp: 'platform',
        userId: 'u1',
      }).token;
    const stamped = appSession([AI_CONSENT_REQUIRED_SCOPE]);
    expect(requiresAiDataConsent(req(`Bearer ${appSession([])}`))).toBe(false);
    expect(requiresAiDataConsent(req(`Bearer ${stamped}`))).toBe(true);

    f.rpc.mockResolvedValue({ data: false, error: null });
    expect(
      (await enforceAiDataConsent(req(`Bearer ${stamped}`), 'u1'))?.status
    ).toBe(403);
    vi.unstubAllEnvs();
  });
});
