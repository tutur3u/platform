import { NavTabs } from '../../types/Tab';

export const infrastructureTabs: NavTabs = {
  namespace: 'infrastructure-tabs',
  tabs: [
    {
      name: 'overview',
      href: '/[wsId]/infrastructure',
    },
    {
      name: 'users',
      href: '/[wsId]/infrastructure/users',
      disabled: true,
    },
    {
      name: 'storage',
      href: '/[wsId]/infrastructure/storage',
      disabled: true,
    },
    {
      name: 'features',
      href: '/[wsId]/infrastructure/features',
      disabled: true,
    },
    {
      name: 'monitoring',
      href: '/[wsId]/infrastructure/monitoring',
      disabled: true,
    },
    {
      name: 'backups',
      href: '/[wsId]/infrastructure/backups',
      disabled: true,
    },
    {
      name: 'integrations',
      href: '/[wsId]/infrastructure/integrations',
      disabled: true,
    },
  ],
};
