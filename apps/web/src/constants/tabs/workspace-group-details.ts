import { NavTabs } from '../../types/Tab';

export const wsUserGroupDetailsTabs: NavTabs = {
  namespace: 'ws-user-groups-details-tabs',
  tabs: [
    {
      name: 'information',
      href: '/[wsId]/users/groups/[groupId]',
    },
    {
      name: 'settings',
      href: '/[wsId]/users/groups/[groupId]/settings',
      disabled: true,
    },
  ],
};
