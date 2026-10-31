import { expect, it } from 'vitest';
import { rolePermissionPayload } from './permission-payload';

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

it('returns an empty payload when only explicit grants are set', () => {
  const permissions = {} as Parameters<typeof rolePermissionPayload>[0];
  permissions.manage_mastermind = true;
  expect(rolePermissionPayload(permissions)).toEqual([]);
});
