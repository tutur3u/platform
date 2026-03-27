export const GROUP_MEMBERSHIP_FILTER_VALUES = [
  'all',
  'at-least-one',
  'exactly-one',
  'none',
] as const;

export type GroupMembershipFilter =
  (typeof GROUP_MEMBERSHIP_FILTER_VALUES)[number];

export function getGroupMembershipTranslationKey(value: GroupMembershipFilter) {
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
