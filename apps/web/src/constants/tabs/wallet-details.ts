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
    {
      name: 'access',
      href: '/[wsId]/finance/wallets/[walletId]/access',
      disabled: true,
    },
    {
      name: 'activity',
      href: '/[wsId]/finance/wallets/[walletId]/activity',
      disabled: true,
    },
  ],
};
