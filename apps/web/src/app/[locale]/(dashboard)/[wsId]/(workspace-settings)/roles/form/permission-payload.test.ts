import { expect, it } from 'vitest';
import {
  rolePermissionPayload,
  rolePermissionValues,
} from './permission-payload';

it('omits explicit grants from role and default-permission payloads', () => {
  const permissions = {} as Parameters<typeof rolePermissionPayload>[0];
  permissions.admin = true;
  for (const enabled of [false, true]) {
    permissions.manage_mastermind = enabled;
    expect(rolePermissionPayload(permissions)).toEqual([
      { id: 'admin', enabled: true },
    ]);
  }
});

it.each([true, false])(
  'preserves stored explicit grant %s for display only',
  (enabled) => {
    const values = rolePermissionValues(
      [{ permissions: [{ id: 'manage_mastermind' }] }],
      [{ id: 'manage_mastermind', enabled }]
    );
    expect(values.manage_mastermind).toBe(enabled);
    expect(rolePermissionPayload(values)).toEqual([]);
  }
);
