import { describe, expect, it } from 'vitest';
import { areContactsConfigIdsAllowed } from './contacts-workspace-configs';

function withPermissions(granted: string[]) {
  return {
    containsPermission: (permission: string) => granted.includes(permission),
  } as never;
}

describe('Contacts workspace config access', () => {
  it.each([
    'view_users_public_info',
    'view_users_private_info',
    'view_user_groups',
    'update_users',
  ])(
    'lets %s readers load the user status labels used by Contacts tables',
    (permission) => {
      expect(
        areContactsConfigIdsAllowed(
          ['user_status_labels'],
          withPermissions([permission])
        )
      ).toBe(true);
    }
  );

  it('keeps user status labels hidden from unrelated workspace roles', () => {
    expect(
      areContactsConfigIdsAllowed(
        ['user_status_labels'],
        withPermissions(['view_finance_stats'])
      )
    ).toBe(false);
  });
});
