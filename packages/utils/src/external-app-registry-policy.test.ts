import { describe, expect, it } from 'vitest';
import {
  assertExternalAppRegistrationAllowed,
  expandWildcardScopes,
  getAllowedAppTokenScopes,
  getReservedInternalAppNames,
  hasGrantedScope,
  INTERNAL_TOKEN_TARGETS,
  isInternalAppScope,
  isReservedExternalAppId,
  isReservedInternalAppName,
  parseExternalAppLogoUrl,
  parseMaxBearerTtlSeconds,
  resolveMaxBearerTtlFieldValue,
  scopeGrantCovers,
  WILDCARD_SCOPE_COVERAGE,
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

describe('external app logo URL', () => {
  it('keeps a public https URL', () => {
    expect(
      parseExternalAppLogoUrl(' https://showcase.example.net/edufest/logo.png ')
    ).toBe('https://showcase.example.net/edufest/logo.png');
  });

  it.each([
    null,
    '',
    'http://example.com/logo.png',
    'javascript:alert(1)',
    'data:image/png;base64,AAAA',
    'https://user:pass@example.com/logo.png',
    'https://127.0.0.1/logo.png',
    'https://[::1]/logo.png',
    'https://localhost/logo.png',
    'https://printer.local/logo.png',
    'https://db.internal/logo.png',
    'https://localhost./logo.png',
    'https://metadata.google.internal./logo.png',
    'https://router.home.arpa/logo.png',
    'https://nas.localdomain/logo.png',
    `https://example.com/${'a'.repeat(2100)}`,
  ])('refuses %s', (value) => {
    expect(parseExternalAppLogoUrl(value)).toBeNull();
  });
});

describe('scope coverage', () => {
  it('freezes what each wildcard covers', () => {
    // Adding a scope here widens every app that holds the wildcard; grant new
    // scopes explicitly instead.
    expect(WILDCARD_SCOPE_COVERAGE).toEqual({
      'external-projects:*': [
        'external-projects:manage',
        'external-projects:publish',
        'external-projects:read',
      ],
    });
    expect(Object.isFrozen(WILDCARD_SCOPE_COVERAGE)).toBe(true);
    expect(
      Object.isFrozen(WILDCARD_SCOPE_COVERAGE['external-projects:*'])
    ).toBe(true);
  });

  it('covers exact grants and the frozen external-projects list only', () => {
    expect(
      scopeGrantCovers('workspace:cron:write', 'workspace:cron:write')
    ).toBe(true);
    for (const scope of [
      'external-projects:read',
      'external-projects:publish',
      'external-projects:manage',
    ]) {
      expect(scopeGrantCovers('external-projects:*', scope)).toBe(true);
    }
    expect(
      scopeGrantCovers('external-projects:*', 'external-projects:export')
    ).toBe(false);
  });

  it('never lets a bare or other wildcard cover a scope', () => {
    for (const scope of [
      'workspace:cron:write',
      'workspace:members:write',
      'workspace:drive:write',
      'drive.files:read',
      'ai:use',
    ]) {
      expect(hasGrantedScope(['*'], scope)).toBe(false);
      expect(hasGrantedScope(['workspace:*'], scope)).toBe(false);
      expect(hasGrantedScope(['drive.files:*'], scope)).toBe(false);
    }
  });
});

describe('expandWildcardScopes', () => {
  it('issues the frozen list for external-projects:* and drops other wildcards', () => {
    expect(
      expandWildcardScopes([
        '*',
        'external-projects:*',
        'workspace:*',
        'workspace:drive:read',
        'external-projects:read',
      ])
    ).toEqual([
      'external-projects:manage',
      'external-projects:publish',
      'external-projects:read',
      'workspace:drive:read',
    ]);
    expect(expandWildcardScopes(['*', 'ai:*'])).toEqual([]);
  });
});

describe('getAllowedAppTokenScopes', () => {
  it('refuses first-party session scopes under any grant', () => {
    expect(() =>
      getAllowedAppTokenScopes({
        allowedScopes: ['*', 'internal-app:session'],
        requestedScopes: ['internal-app:session'],
      })
    ).toThrow('app_scope_not_allowed');
    expect(
      getAllowedAppTokenScopes({
        allowedScopes: ['internal-app:session', 'workspace:session'],
        requestedScopes: [],
      })
    ).toEqual(['workspace:session']);
  });

  it('refuses a scope that only a wildcard would have covered', () => {
    expect(() =>
      getAllowedAppTokenScopes({
        allowedScopes: ['*'],
        requestedScopes: ['workspace:cron:write'],
      })
    ).toThrow('app_scope_not_allowed');
    expect(() =>
      getAllowedAppTokenScopes({
        allowedScopes: ['external-projects:*'],
        requestedScopes: ['external-projects:export'],
      })
    ).toThrow('app_scope_not_allowed');
  });

  it('keeps every scope the registered apps request today', () => {
    // Registry listing from the admin API; each app must still be able to
    // request each of its allowed scopes, alone and all together.
    const registry: Record<string, string[]> = {
      chunli: ['external-projects:*'],
      cybershield35: [
        'ai:use',
        'external-projects:manage',
        'tts:use',
        'users:profile:read',
        'users:profile:write',
        'workspace:cron:read',
        'workspace:cron:write',
        'workspace:drive:read',
        'workspace:drive:write',
        'workspace:members:read',
        'workspace:members:write',
        'workspace:roles:read',
        'workspace:roles:write',
        'workspace:session',
      ],
      exocorpse: [
        'external-projects:*',
        'users:profile:read',
        'users:profile:write',
      ],
      fysh: [
        'external-projects:manage',
        'external-projects:publish',
        'external-projects:read',
        'users:profile:read',
        'users:profile:write',
      ],
      'ieeai-stats': ['workspace:session'],
      rennu: [
        'external-projects:manage',
        'external-projects:publish',
        'external-projects:read',
        'users:profile:read',
        'users:profile:write',
      ],
      sono2010: ['users:profile:read'],
    };
    for (const allowedScopes of Object.values(registry)) {
      const requestable = allowedScopes.flatMap((scope) =>
        scope === 'external-projects:*'
          ? [scope, ...WILDCARD_SCOPE_COVERAGE[scope]!]
          : [scope]
      );
      for (const scope of requestable) {
        expect(
          getAllowedAppTokenScopes({ allowedScopes, requestedScopes: [scope] })
        ).toEqual([scope]);
      }
      expect(
        getAllowedAppTokenScopes({ allowedScopes, requestedScopes: [] })
      ).toEqual([...allowedScopes].sort());
      expect(
        getAllowedAppTokenScopes({
          allowedScopes,
          requestedScopes: requestable,
        })
      ).toEqual([...new Set(requestable)].sort());
    }
  });
});
