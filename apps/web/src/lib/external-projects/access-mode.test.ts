import type { AppCoordinationTokenClaims } from '@tuturuuu/auth/app-coordination';
import type { PermissionsResult } from '@tuturuuu/utils/workspace-helper';
import { describe, expect, it } from 'vitest';
import {
  appTokenHasRequiredScope,
  hasWorkspaceExternalProjectPermission,
  type WorkspaceExternalProjectMode,
} from './access-mode';

const permissionsFor = (granted: string[]) =>
  ({
    containsPermission: (permission: string) => granted.includes(permission),
  }) as unknown as PermissionsResult;

const MODES: WorkspaceExternalProjectMode[] = [
  'read',
  'edit',
  'publish',
  'manage',
];

describe('external project access modes', () => {
  it('applies the CMS role matrix and keeps legacy modes unchanged', () => {
    const matrix: Record<string, WorkspaceExternalProjectMode[]> = {
      edit_external_projects: ['read', 'edit'],
      publish_external_projects: ['read', 'edit', 'publish'],
      manage_external_projects: ['read', 'edit', 'publish', 'manage'],
      none: [],
    };
    for (const [role, allowed] of Object.entries(matrix)) {
      for (const mode of MODES) {
        expect({
          mode,
          ok: hasWorkspaceExternalProjectPermission(
            permissionsFor([role]),
            mode
          ),
          role,
        }).toEqual({ mode, ok: allowed.includes(mode), role });
      }
    }
    expect(hasWorkspaceExternalProjectPermission(null, 'edit')).toBe(false);
  });

  it('needs at least the publish scope for draft editing by app token', () => {
    const claims = { scopes: [] } as unknown as AppCoordinationTokenClaims;
    const has = (scopes: string[]) =>
      appTokenHasRequiredScope({ ...claims, scopes }, 'edit');
    expect(has(['external-projects:read'])).toBe(false);
    expect(has(['external-projects:publish'])).toBe(true);
    expect(has(['external-projects:manage'])).toBe(true);
  });
});

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

  it('lets a broader scope answer for a narrower one', () => {
    // `manage` is the right to change the content model, which nobody can
    // exercise without also reading and publishing. Requiring the narrow scope
    // by name meant an app granted everything could do nothing, and no
    // permission change fixed it because the grant was never what was missing.
    for (const mode of ['read', 'publish', 'manage'] as const) {
      expect(
        appTokenHasRequiredScope(
          { ...baseClaims, scopes: ['external-projects:manage'] },
          mode
        )
      ).toBe(true);
    }

    expect(
      appTokenHasRequiredScope(
        { ...baseClaims, scopes: ['external-projects:publish'] },
        'read'
      )
    ).toBe(true);
    // Narrower still cannot answer for broader.
    expect(
      appTokenHasRequiredScope(
        { ...baseClaims, scopes: ['external-projects:publish'] },
        'manage'
      )
    ).toBe(false);
  });
});
