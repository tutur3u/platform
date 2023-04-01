import { NavTabs } from '../../types/Tab';

export const teamTabs: NavTabs = {
  namespace: 'team-tabs',
  tabs: [
    {
      name: 'Overview',
      href: '/[wsId]/teams/[teamId]',
    },
    {
      name: 'Members',
      href: '/[wsId]/teams/[teamId]/members',
    },
    {
      name: 'Settings',
      href: '/[wsId]/teams/[teamId]/settings',
    },
  ],
};
