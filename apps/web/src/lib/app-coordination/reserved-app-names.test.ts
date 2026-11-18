import { APP_SESSION_SCOPE } from '@tuturuuu/auth/app-session';
import { CLI_APP_TARGET_APP } from '@tuturuuu/auth/cli-session';
import {
  FIRST_PARTY_APP_SESSION_SCOPE,
  isReservedInternalAppName,
} from '@tuturuuu/utils/external-app-registry-policy';
import { describe, expect, it } from 'vitest';
import { ALL_SATELLITE_APP_SESSION_TARGETS } from '@/lib/api-auth-audiences';
import { CURRENT_USER_APP_SESSION_AUTH } from '@/legacy-api-routes/v1/users/me/session-auth';
import { isExternalAppClaims } from './reserved-app-names';

describe('first-party app session boundary', () => {
  it('matches the scope app sessions are minted with', () => {
    expect(FIRST_PARTY_APP_SESSION_SCOPE).toBe(APP_SESSION_SCOPE);
  });

  it('reserves every app-session audience used by web routes', () => {
    for (const name of [
      ...ALL_SATELLITE_APP_SESSION_TARGETS,
      ...CURRENT_USER_APP_SESSION_AUTH.targetApp,
      CLI_APP_TARGET_APP,
    ]) {
      expect(isReservedInternalAppName(name), name).toBe(true);
    }
  });

  it('classifies only non-session, non-internal claims as external', () => {
    expect(
      isExternalAppClaims({
        scopes: ['users:profile:read'],
        target_app: 'fysh',
      })
    ).toBe(true);
    expect(
      isExternalAppClaims({ scopes: [APP_SESSION_SCOPE], target_app: 'cms' })
    ).toBe(false);
    expect(
      isExternalAppClaims({
        scopes: [APP_SESSION_SCOPE],
        target_app: 'mastermind',
      })
    ).toBe(false);
    expect(
      isExternalAppClaims({ scopes: ['users:profile:read'], target_app: 'cms' })
    ).toBe(false);
  });

  it('treats claims without a scope list as external', () => {
    expect(isExternalAppClaims({ target_app: 'fysh' })).toBe(true);
    expect(isExternalAppClaims({ scopes: null, target_app: 'fysh' })).toBe(
      true
    );
  });
});
