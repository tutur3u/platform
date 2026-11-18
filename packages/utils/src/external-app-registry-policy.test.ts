import { describe, expect, it } from 'vitest';
import {
  assertExternalAppRegistrationAllowed,
  getReservedInternalAppNames,
  INTERNAL_TOKEN_TARGETS,
  isInternalAppScope,
  isReservedExternalAppId,
  isReservedInternalAppName,
  parseMaxBearerTtlSeconds,
  resolveMaxBearerTtlFieldValue,
  wasIssuedBeforeSecretRotation,
} from './external-app-registry-policy';
import { APP_DOMAIN_MAP } from './internal-domains';

describe('reserved internal app names', () => {
  it('reserves every internal app domain name, case-folded', () => {
    const reserved = getReservedInternalAppNames();
    for (const { name } of APP_DOMAIN_MAP) {
      expect(reserved.has(name.toLowerCase())).toBe(true);
    }
    expect(isReservedInternalAppName('CMS')).toBe(true);
    expect(isReservedInternalAppName(' platform ')).toBe(true);
  });

  it('reserves internal token targets without a domain for registrations only', () => {
    for (const target of INTERNAL_TOKEN_TARGETS) {
      expect(isReservedExternalAppId(target.toUpperCase())).toBe(true);
      expect(isReservedInternalAppName(target)).toBe(false);
    }
  });

  it('does not reserve the registered production external app ids', () => {
    for (const id of [
      'chunli',
      'cybershield35',
      'exocorpse',
      'fysh',
      'ieeai-stats',
      'kendra',
      'rennu',
      'richfield',
      'sono2010',
      'theguyser',
      'yashie',
      'yoola',
    ]) {
      expect(isReservedInternalAppName(id), id).toBe(false);
    }
  });

  it('treats only internal-app scopes as first-party session scopes', () => {
    expect(isInternalAppScope('internal-app:session')).toBe(true);
    expect(isInternalAppScope('INTERNAL-APP:refresh')).toBe(true);
    expect(isInternalAppScope('workspace:session')).toBe(false);
    expect(isInternalAppScope('*')).toBe(false);
  });

  it('refuses reserved names and internal scopes in a registration', () => {
    expect(() =>
      assertExternalAppRegistrationAllowed({ appId: 'mira' })
    ).toThrow('reserved_app_id');
    expect(() =>
      assertExternalAppRegistrationAllowed({
        allowedScopes: ['external-projects:*', 'internal-app:session'],
        appId: 'fysh',
      })
    ).toThrow('internal_scope_not_allowed');
    expect(() =>
      assertExternalAppRegistrationAllowed({
        allowedScopes: ['workspace:session'],
        appId: 'fysh',
      })
    ).not.toThrow();
  });
});

describe('bearer TTL cap field', () => {
  it('parses whole seconds inside the bounds only', () => {
    expect(parseMaxBearerTtlSeconds('900')).toBe(900);
    for (const value of ['', null, '299', '86401', '9e2', ' -5']) {
      expect(parseMaxBearerTtlSeconds(value)).toBeNull();
    }
  });

  it('writes the default for a new app and keeps an existing one', () => {
    const resolve = (isNewApp: boolean, requested?: number | null) =>
      resolveMaxBearerTtlFieldValue({ isNewApp, requested });
    expect(resolve(true)).toBe('900');
    expect(resolve(true, null)).toBe('900');
    expect(resolve(true, 3600)).toBe('3600');
    expect(resolve(false)).toBeUndefined();
    expect(resolve(false, null)).toBe('');
    expect(resolve(false, 1800)).toBe('1800');
    expect(() => resolve(false, 60)).toThrow('invalid_max_bearer_ttl');
  });
});

describe('secret rotation', () => {
  const rotatedAt = '2026-11-01T12:00:00.500Z';
  const rotatedAtSeconds = Math.floor(Date.parse(rotatedAt) / 1000);

  it('revokes bearers minted before the current secret', () => {
    expect(
      wasIssuedBeforeSecretRotation({ iat: rotatedAtSeconds - 1 }, rotatedAt)
    ).toBe(true);
    expect(
      wasIssuedBeforeSecretRotation({ iat: rotatedAtSeconds }, rotatedAt)
    ).toBe(false);
    expect(wasIssuedBeforeSecretRotation({ iat: 1 }, null)).toBe(false);
    expect(wasIssuedBeforeSecretRotation({ iat: 1 }, 'garbage')).toBe(true);
    expect(wasIssuedBeforeSecretRotation({}, rotatedAt)).toBe(true);
  });
});
