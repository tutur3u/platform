import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppCoordinationToken } from '@tuturuuu/auth/app-coordination';
import {
  createAppSessionToken,
  createAppSessionRefreshToken,
} from '@tuturuuu/auth/app-session-core';
import {
  isExplicitBearerRequest,
  rejectsLegacyMountedBearer,
} from './mounted-bearer';

describe('mounted explicit bearer boundary', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv(
      'TUTURUUU_APP_COORDINATION_SECRET',
      'synthetic-mounted-bearer-test'
    );
    vi.stubEnv('APP_COORDINATION_TOKEN_SIGNER', 'current');
    vi.stubEnv('APP_COORDINATION_TOKEN_NEXT_SECRET', '');
  });
  afterEach(() => vi.unstubAllEnvs());
  it('rejects browser access and refresh tokens replayed without cookies', () => {
    vi.stubEnv('NODE_ENV', 'test');
    for (const token of [
      createAppSessionToken({ userId: 'fixture', targetApp: 'mind' }).token,
      createAppSessionRefreshToken({ userId: 'fixture', targetApp: 'mind' })
        .token,
    ]) {
      expect(
        rejectsLegacyMountedBearer({
          headers: new Headers({ authorization: `Bearer ${token}` }),
        })
      ).toBe(true);
    }
    vi.unstubAllEnvs();
  });
  it('leaves explicit coordination tokens for existing endpoint verification', () => {
    vi.stubEnv('NODE_ENV', 'test');
    const token = createAppCoordinationToken({
      userId: 'fixture',
      targetApp: 'mind',
      scopes: ['mind:server'],
    }).token;
    expect(
      rejectsLegacyMountedBearer({
        headers: new Headers({ authorization: `Bearer ${token}` }),
      })
    ).toBe(false);
    vi.unstubAllEnvs();
  });
  it('treats even an empty Cookie header as browser ambient credentials', () => {
    for (const cookie of [
      '',
      'mind_locale=en',
      'sb-example-auth-token=invalid',
    ]) {
      expect(
        isExplicitBearerRequest({
          headers: new Headers({ authorization: 'Bearer fixture', cookie }),
        })
      ).toBe(false);
    }
    expect(
      isExplicitBearerRequest({
        headers: new Headers({ authorization: 'Bearer fixture' }),
      })
    ).toBe(true);
  });
});
