import { describe, expect, it } from 'vitest';
import { permissions } from '../permissions';

describe('workspace permission catalog', () => {
  const workspaceId = '11111111-1111-4111-8111-111111111111';

  it('keeps workspace role forms scoped by default', () => {
    const permissionIds = permissions({
      wsId: workspaceId,
      user: null,
    }).map((permission) => permission.id);

    expect(permissionIds).toContain('admin');
    expect(permissionIds).not.toContain('view_infrastructure');
    expect(permissionIds).not.toContain('manage_infrastructure_stress_tests');
    expect(permissionIds).not.toContain('manage_workspace_secrets');
  });

  it('exposes the full shared catalog for typed defaults', () => {
    const permissionIds = permissions({
      catalog: 'full',
      wsId: workspaceId,
      user: null,
    }).map((permission) => permission.id);

    expect(permissionIds).toContain('admin');
    expect(permissionIds).toContain('view_infrastructure');
    expect(permissionIds).toContain('manage_infrastructure_stress_tests');
    expect(permissionIds).toContain('manage_external_migrations');
    expect(permissionIds).toContain('manage_workspace_secrets');
    expect(new Set(permissionIds).size).toBe(permissionIds.length);
  });
});
