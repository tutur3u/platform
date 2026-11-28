// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AI_CONSENT_REQUIRED_SCOPE,
  aiConsentBrowserOriginTransferFor,
  createAiConsentBrowserOriginTransfer,
  readAiConsentBrowserOriginTransfer,
  requestRequiresAiDataConsent,
} from './ai-consent-session';
import {
  APP_COORDINATION_SECRET_ENV_NAMES,
  createAppCoordinationToken,
} from './app-coordination-token';

const session = (scopes: string[]) =>
  createAppCoordinationToken({
    scopes: ['internal-app:session', ...scopes],
    targetApp: 'platform',
    userId: 'user-1',
  }).token;

const request = (headers: Record<string, string> = {}) =>
  new Request('https://tuturuuu.com/api/ai/chat', { headers });

describe('Mira AI consent for app sessions', () => {
  beforeEach(() => {
    for (const name of APP_COORDINATION_SECRET_ENV_NAMES) vi.stubEnv(name, '');
    vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'test-secret'.repeat(4));
  });
  afterEach(() => vi.unstubAllEnvs());

  it('treats Supabase bearer callers as native and cookie sessions as browser', () => {
    expect(
      requestRequiresAiDataConsent(request({ authorization: 'Bearer eyJ.x' }))
    ).toBe(true);
    expect(requestRequiresAiDataConsent(request())).toBe(false);
    expect(
      requestRequiresAiDataConsent(
        request({ cookie: 'sb-project-auth-token=base64-abc' })
      )
    ).toBe(false);
  });

  it('requires consent for a stamped app session as bearer or cookie', () => {
    const stamped = session([AI_CONSENT_REQUIRED_SCOPE]);
    expect(
      requestRequiresAiDataConsent(
        request({ authorization: `Bearer ${stamped}` })
      )
    ).toBe(true);
    expect(
      requestRequiresAiDataConsent(
        request({ cookie: `a=1; tuturuuu_app_session=${stamped}` })
      )
    ).toBe(true);
  });

  it('keeps an unstamped app session exempt and ignores forged stamps', () => {
    expect(
      requestRequiresAiDataConsent(
        request({ authorization: `Bearer ${session([])}` })
      )
    ).toBe(false);
    // A stamp in a token that fails verification authenticates nothing.
    expect(
      requestRequiresAiDataConsent(
        request({ authorization: 'Bearer ttr_app_forged.token.sig' })
      )
    ).toBe(false);
  });

  it('binds the browser origin transfer to user and target app', () => {
    const transfer = createAiConsentBrowserOriginTransfer('user-1', 'rewise');
    expect(
      readAiConsentBrowserOriginTransfer(transfer, 'user-1', 'rewise')
    ).toBe(true);
    expect(
      readAiConsentBrowserOriginTransfer(transfer, 'user-2', 'rewise')
    ).toBe(false);
    expect(
      readAiConsentBrowserOriginTransfer(transfer, 'user-1', 'platform')
    ).toBe(false);
    expect(
      readAiConsentBrowserOriginTransfer('forged', 'user-1', 'rewise')
    ).toBe(false);
    expect(
      readAiConsentBrowserOriginTransfer(undefined, 'user-1', 'rewise')
    ).toBe(false);
    // An app session is not a browser origin transfer.
    expect(
      readAiConsentBrowserOriginTransfer(session([]), 'user-1', 'platform')
    ).toBe(false);
  });

  it('issues a transfer only for a browser minting request', () => {
    expect(
      aiConsentBrowserOriginTransferFor(request(), 'user-1', 'rewise')
    ).toEqual(expect.stringMatching(/^ttr_app_/u));
    expect(
      aiConsentBrowserOriginTransferFor(
        request({ authorization: 'Bearer eyJ.x' }),
        'user-1',
        'rewise'
      )
    ).toBeUndefined();
    expect(
      aiConsentBrowserOriginTransferFor(
        request({
          authorization: `Bearer ${session([AI_CONSENT_REQUIRED_SCOPE])}`,
        }),
        'user-1',
        'rewise'
      )
    ).toBeUndefined();
  });
});
