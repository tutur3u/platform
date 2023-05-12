import { NavTabs } from '../../types/Tab';

export const wsUserDetailsTabs: NavTabs = {
  namespace: 'ws-user-details-tabs',
  tabs: [
    {
      name: 'information',
      href: '/[wsId]/users/[userId]',
    },
    {
      name: 'vitals',
      href: '/[wsId]/users/[userId]/vitals',
      disabled: true,
    },
    {
      name: 'invoices',
      href: '/[wsId]/users/[userId]/invoices',
      disabled: true,
    },
    {
      name: 'checkups',
      href: '/[wsId]/users/[userId]/checkups',
      disabled: true,
    },
    {
      name: 'settings',
      href: '/[wsId]/users/[userId]/settings',
      disabled: true,
    },
  ],
};
