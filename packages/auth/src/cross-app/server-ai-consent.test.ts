vi.mock('@tuturuuu/utils/required-mfa-app-session', () => ({
  isRequiredMfaProofAllowed: async () => true,
}));

import {
  AI_CONSENT_REQUIRED_SCOPE,
  createAiConsentBrowserOriginTransfer,
} from '@tuturuuu/utils/ai-consent-session';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyAppCoordinationToken } from '../app-coordination';
import { createPOST } from './server';

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    auth: {
      admin: {
        getUserById: async (id: string) => ({
          data: {
            user: {
              id,
              email: 'agent@example.com',
              email_confirmed_at: '2026-01-01',
            },
          },
          error: null,
        }),
      },
    },
  }),
  createClient: (...args: unknown[]) => mocks.createClient(...args),
}));

function redeemReturns(sessionData: Record<string, unknown>) {
  mocks.createClient.mockResolvedValue({
    rpc: vi.fn().mockResolvedValue({
      data: [{ session_data: sessionData, user_id: 'user-1' }],
      error: null,
    }),
  });
}

function cookieToken(response: Response, name: string) {
  const header = response.headers.get('set-cookie') ?? '';
  const token = header.match(new RegExp(`${name}=(ttr_app_[^;,]+)`))?.[1];
  expect(token).toBeDefined();
  const verification = verifyAppCoordinationToken(token!);
  expect(verification.ok).toBe(true);
  return verification.ok ? verification.claims.scopes : [];
}

async function verify(appName: 'learn' | 'platform', sessionKind?: string) {
  return createPOST(appName, {
    ...(sessionKind ? { sessionKind: 'cli-app-session' as const } : {}),
  })(
    new NextRequest('https://learn.tuturuuu.com/api/auth/verify-app-token', {
      body: JSON.stringify({ token: 'handoff' }),
      method: 'POST',
    })
  );
}

describe('cross-app sessions and Mira AI consent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.stubEnv('APP_COORDINATION_TOKEN_SECRET', '');
    vi.stubEnv('SUPABASE_SECRET_KEY', '');
    vi.stubEnv('SUPABASE_SERVICE_KEY', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'test-secret');
  });

  it('keeps a browser-originated handoff exempt', async () => {
    redeemReturns({
      aiConsentTransfer: createAiConsentBrowserOriginTransfer(
        'user-1',
        'learn'
      ),
      email: 'agent@example.com',
    });
    const response = await verify('learn');
    expect(response.status).toBe(200);
    for (const name of ['tuturuuu_app_session', 'tuturuuu_app_session_refresh'])
      expect(cookieToken(response, name)).not.toContain(
        AI_CONSENT_REQUIRED_SCOPE
      );
  });

  it.each([
    ['no transfer', {}],
    ['a forged transfer', { aiConsentTransfer: 'forged' }],
    [
      'a transfer for another app',
      {
        aiConsentTransfer: createAiConsentBrowserOriginTransfer(
          'user-1',
          'rewise'
        ),
      },
    ],
  ])('stamps sessions from a handoff with %s', async (_label, extra) => {
    redeemReturns({ email: 'agent@example.com', ...extra });
    const response = await verify('learn');
    expect(response.status).toBe(200);
    for (const name of ['tuturuuu_app_session', 'tuturuuu_app_session_refresh'])
      expect(cookieToken(response, name)).toContain(AI_CONSENT_REQUIRED_SCOPE);
  });

  it('stamps both CLI tokens from a handoff without a browser origin', async () => {
    redeemReturns({ email: 'agent@example.com' });
    const body = await (await verify('platform', 'cli')).json();
    for (const token of [
      body.session.access_token,
      body.session.refresh_token,
    ]) {
      const verification = verifyAppCoordinationToken(token);
      expect(verification.ok && verification.claims.scopes).toContain(
        AI_CONSENT_REQUIRED_SCOPE
      );
    }
  });

  it('stamps the local session when central verification says so', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          aiConsentRequired: true,
          sessionData: { email: 'learn@example.com' },
          userId: 'user-2',
          valid: true,
        })
      )
    );
    const response = await createPOST('learn', {
      verificationBaseUrl: 'https://tuturuuu.localhost',
    })(
      new NextRequest(
        'https://learn.tuturuuu.localhost/api/auth/verify-app-token',
        {
          body: JSON.stringify({ token: 'handoff' }),
          method: 'POST',
        }
      )
    );
    expect(response.status).toBe(200);
    expect(cookieToken(response, 'tuturuuu_app_session')).toContain(
      AI_CONSENT_REQUIRED_SCOPE
    );
  });
});
