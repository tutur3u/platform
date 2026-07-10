export const DATABASE_LINK_STATUS_VALUES = [
  'all',
  'linked',
  'virtual',
] as const;

export type DatabaseLinkStatus = (typeof DATABASE_LINK_STATUS_VALUES)[number];

export const DATABASE_GROUP_MEMBERSHIP_VALUES = [
  'all',
  'at-least-one',
  'exactly-one',
  'none',
] as const;

export type DatabaseGroupMembership =
  (typeof DATABASE_GROUP_MEMBERSHIP_VALUES)[number];

export const DATABASE_DEFAULT_LINK_STATUS_CONFIG_ID =
  'USERS_DATABASE_DEFAULT_LINK_STATUS';
export const DATABASE_DEFAULT_GROUP_MEMBERSHIP_CONFIG_ID =
  'USERS_DATABASE_DEFAULT_GROUP_MEMBERSHIP';

export const DEFAULT_DATABASE_LINK_STATUS: DatabaseLinkStatus = 'all';
export const DEFAULT_DATABASE_GROUP_MEMBERSHIP: DatabaseGroupMembership = 'all';

export function parseDatabaseLinkStatus(
  value: string | null | undefined,
  fallback: DatabaseLinkStatus = DEFAULT_DATABASE_LINK_STATUS
): DatabaseLinkStatus {
  return DATABASE_LINK_STATUS_VALUES.includes(value as DatabaseLinkStatus)
    ? (value as DatabaseLinkStatus)
    : fallback;
}

export function parseDatabaseGroupMembership(
  value: string | null | undefined,
  fallback: DatabaseGroupMembership = DEFAULT_DATABASE_GROUP_MEMBERSHIP
): DatabaseGroupMembership {
  return DATABASE_GROUP_MEMBERSHIP_VALUES.includes(
    value as DatabaseGroupMembership
  )
    ? (value as DatabaseGroupMembership)
    : fallback;
}

export function getDatabaseGroupMembershipTranslationKey(
  value: DatabaseGroupMembership
) {
  switch (value) {
    case 'at-least-one':
      return 'group_membership_at_least_one';
    case 'exactly-one':
      return 'group_membership_exactly_one';
    case 'none':
      return 'group_membership_none';
    default:
      return 'group_membership_all';
  }
}
