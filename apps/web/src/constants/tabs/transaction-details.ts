import { NavTabs } from '../../types/Tab';

export const transactionDetailsTabs: NavTabs = {
  namespace: 'transaction-details-tabs',
  tabs: [
    {
      name: 'information',
      href: '/[wsId]/finance/transactions/[transactionId]',
    },
    {
      name: 'settings',
      href: '/[wsId]/finance/transactions/[transactionId]/settings',
    },
  ],
};
