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
