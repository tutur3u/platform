import { NavTabs } from '../../types/Tab';

export const teamTabs: NavTabs = {
  namespace: 'team-tabs',
  tabs: [
    {
      name: 'overview',
      href: '/[wsId]/teams/[teamId]',
    },
    {
      name: 'members',
      href: '/[wsId]/teams/[teamId]/members',
    },
    {
      name: 'settings',
      href: '/[wsId]/teams/[teamId]/settings',
    },
  ],
};
