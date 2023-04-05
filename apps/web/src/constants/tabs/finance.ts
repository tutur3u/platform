import { NavTabs } from '../../types/Tab';

export const financeTabs: NavTabs = {
  namespace: 'finance-tabs',
  tabs: [
    {
      name: 'overview',
      href: '/[wsId]/finance',
    },
    {
      name: 'wallets',
      href: '/[wsId]/finance/wallets',
    },
    {
      name: 'transactions',
      href: '/[wsId]/finance/transactions',
    },
    {
      name: 'transaction-categories',
      href: '/[wsId]/finance/transactions/categories',
    },
    {
      name: 'invoices',
      href: '/[wsId]/finance/invoices',
    },
  ],
};
