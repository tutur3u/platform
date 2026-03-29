import {
  DATABASE_GROUP_MEMBERSHIP_VALUES,
  getDatabaseGroupMembershipTranslationKey,
} from '@/lib/users-database-filters';

export const GROUP_MEMBERSHIP_FILTER_VALUES = DATABASE_GROUP_MEMBERSHIP_VALUES;

export type GroupMembershipFilter =
  (typeof GROUP_MEMBERSHIP_FILTER_VALUES)[number];

export function getGroupMembershipTranslationKey(value: GroupMembershipFilter) {
  return getDatabaseGroupMembershipTranslationKey(value);
}
