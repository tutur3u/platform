import { NavTabs } from '../../types/Tab';

export const healthcareTabs: NavTabs = {
  namespace: 'healthcare-tabs',
  tabs: [
    {
      name: 'overview',
      href: '/[wsId]/healthcare',
    },
    {
      name: 'checkups',
      href: '/[wsId]/healthcare/checkups',
    },
    {
      name: 'diagnoses',
      href: '/[wsId]/healthcare/diagnoses',
    },
    {
      name: 'vitals',
      href: '/[wsId]/healthcare/vitals',
    },
    {
      name: 'vital-groups',
      href: '/[wsId]/healthcare/vital-groups',
    },
  ],
};
