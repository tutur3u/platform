import { NavTabs } from '../../types/Tab';

export const settingsTabs: NavTabs = {
  namespace: 'settings-tabs',
  tabs: [
    {
      name: 'account',
      href: '/settings/account',
    },
    {
      name: 'appearance',
      href: '/settings/appearance',
    },
    {
      name: 'notifications',
      href: '/settings/notifications',
      disabled: true,
    },
    {
      name: 'integrations',
      href: '/settings/integrations',
      disabled: true,
    },
    {
      name: 'workspaces',
      href: '/settings/workspaces',
      disabled: true,
    },
    {
      name: 'billing',
      href: '/settings/billing',
      disabled: true,
    },
  ],
};
