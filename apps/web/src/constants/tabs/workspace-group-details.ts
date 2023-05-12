import { NavTabs } from '../../types/Tab';

export const wsUserGroupDetailsTabs: NavTabs = {
  namespace: 'ws-user-groups-details-tabs',
  tabs: [
    {
      name: 'information',
      href: '/[wsId]/users/groups/[groupId]',
    },
    {
      name: 'attendance',
      href: '/[wsId]/users/groups/[groupId]/attendance',
      disabled: true,
    },
    {
      name: 'calendar',
      href: '/[wsId]/users/groups/[groupId]/calendar',
      disabled: true,
    },
    {
      name: 'settings',
      href: '/[wsId]/users/groups/[groupId]/settings',
    },
  ],
};
