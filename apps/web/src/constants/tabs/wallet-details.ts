import { NavTabs } from '../../types/Tab';

export const walletDetailsTabs: NavTabs = {
  namespace: 'wallet-details-tabs',
  tabs: [
    {
      name: 'information',
      href: '/[wsId]/finance/wallets/[walletId]',
    },
    {
      name: 'transactions',
      href: '/[wsId]/finance/wallets/[walletId]/transactions',
    },
  ],
};
