import type { AppCoordinationTokenClaims } from '@tuturuuu/auth/app-coordination';
import { describe, expect, it } from 'vitest';
import { appTokenHasRequiredScope } from './access';

const baseClaims: AppCoordinationTokenClaims = {
  aud: 'tuturuuu-api',
  email: 'agent@example.com',
  exp: 1_800_000_000,
  iat: 1_700_000_000,
  iss: 'tuturuuu',
  jti: 'token-id',
  origin_app: 'web',
  scopes: [],
  sub: '11111111-1111-4111-8111-111111111111',
  target_app: 'cms',
  typ: 'app_coordination',
};

describe('external project app-token scope checks', () => {
  it('rejects empty app coordination scopes', () => {
    expect(appTokenHasRequiredScope(baseClaims, 'read')).toBe(false);
    expect(appTokenHasRequiredScope(baseClaims, 'publish')).toBe(false);
    expect(appTokenHasRequiredScope(baseClaims, 'manage')).toBe(false);
  });

  it('accepts explicit matching scopes', () => {
    expect(
      appTokenHasRequiredScope(
        {
          ...baseClaims,
          scopes: ['external-projects:read'],
        },
        'read'
      )
    ).toBe(true);
    expect(
      appTokenHasRequiredScope(
        {
          ...baseClaims,
          scopes: ['external-projects:*'],
        },
        'manage'
      )
    ).toBe(true);
  });

  it('rejects scopes that do not cover the requested mode', () => {
    expect(
      appTokenHasRequiredScope(
        {
          ...baseClaims,
          scopes: ['external-projects:read'],
        },
        'publish'
      )
    ).toBe(false);
  });
});
