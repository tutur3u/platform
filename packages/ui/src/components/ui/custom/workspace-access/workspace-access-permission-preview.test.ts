import { describe, expect, it } from 'vitest';
import { enabledPermissionCount } from './workspace-access-permission-preview';

describe('enabledPermissionCount', () => {
  it('treats administrator access as granting the full permission catalog', () => {
    expect(
      enabledPermissionCount(
        {
          id: 'admin-role',
          name: 'Administrator',
          permissions: [{ enabled: true, id: 'admin' }],
        },
        42
      )
    ).toBe(42);
  });

  it('counts explicit permissions for non-administrator roles', () => {
    expect(
      enabledPermissionCount(
        {
          id: 'operator-role',
          name: 'Operator',
          permissions: [
            { enabled: true, id: 'initiate_pos_checkout' },
            { enabled: false, id: 'update_inventory' },
          ],
        },
        42
      )
    ).toBe(1);
  });
});
