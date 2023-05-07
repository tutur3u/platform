import { NavTabs } from '../../types/Tab';

export const workspaceTabs: NavTabs = {
  namespace: 'workspace-tabs',
  tabs: [
    {
      name: 'home',
      href: '/[wsId]',
    },
    {
      name: 'teams',
      href: '/[wsId]/teams',
    },
    {
      name: 'members',
      href: '/[wsId]/members',
    },
    {
      name: 'activities',
      href: '/[wsId]/activities',
    },
    {
      name: 'settings',
      href: '/[wsId]/settings',
    },
  ],
};
