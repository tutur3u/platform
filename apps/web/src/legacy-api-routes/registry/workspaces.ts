import type { LegacyApiRouteLoaderMap } from '../types';

export const workspacesRouteLoaders = {
  'workspaces/[wsId]/accept-invite/route.ts': () =>
    import('../workspaces/[wsId]/accept-invite/route'),
  'workspaces/[wsId]/categories/[categoryId]/route.ts': () =>
    import('../workspaces/[wsId]/categories/[categoryId]/route'),
  'workspaces/[wsId]/categories/route.ts': () =>
    import('../workspaces/[wsId]/categories/route'),
  'workspaces/[wsId]/decline-invite/route.ts': () =>
    import('../workspaces/[wsId]/decline-invite/route'),
  'workspaces/[wsId]/finance/charts/balance-trend/route.ts': () =>
    import('../workspaces/[wsId]/finance/charts/balance-trend/route'),
  'workspaces/[wsId]/finance/charts/balance/route.ts': () =>
    import('../workspaces/[wsId]/finance/charts/balance/route'),
  'workspaces/[wsId]/finance/charts/categories/route.ts': () =>
    import('../workspaces/[wsId]/finance/charts/categories/route'),
  'workspaces/[wsId]/finance/charts/daily/route.ts': () =>
    import('../workspaces/[wsId]/finance/charts/daily/route'),
  'workspaces/[wsId]/finance/charts/income-expense-summary/route.ts': () =>
    import('../workspaces/[wsId]/finance/charts/income-expense-summary/route'),
  'workspaces/[wsId]/finance/charts/monthly/route.ts': () =>
    import('../workspaces/[wsId]/finance/charts/monthly/route'),
  'workspaces/[wsId]/finance/overview/route.ts': () =>
    import('../workspaces/[wsId]/finance/overview/route'),
  'workspaces/[wsId]/invite-links/[linkId]/route.ts': () =>
    import('../workspaces/[wsId]/invite-links/[linkId]/route'),
  'workspaces/[wsId]/invite-links/route.ts': () =>
    import('../workspaces/[wsId]/invite-links/route'),
  'workspaces/[wsId]/invite-status/route.ts': () =>
    import('../workspaces/[wsId]/invite-status/route'),
  'workspaces/[wsId]/members/enhanced/route.ts': () =>
    import('../workspaces/[wsId]/members/enhanced/route'),
  'workspaces/[wsId]/members/invite/route.ts': () =>
    import('../workspaces/[wsId]/members/invite/route'),
  'workspaces/[wsId]/members/profile/route.ts': () =>
    import('../workspaces/[wsId]/members/profile/route'),
  'workspaces/[wsId]/members/route.ts': () =>
    import('../workspaces/[wsId]/members/route'),
  'workspaces/[wsId]/products/categories/migrate/route.ts': () =>
    import('../workspaces/[wsId]/products/categories/migrate/route'),
  'workspaces/[wsId]/products/units/migrate/route.ts': () =>
    import('../workspaces/[wsId]/products/units/migrate/route'),
  'workspaces/[wsId]/route.ts': () => import('../workspaces/[wsId]/route'),
  'workspaces/[wsId]/secrets/[secretId]/route.ts': () =>
    import('../workspaces/[wsId]/secrets/[secretId]/route'),
  'workspaces/[wsId]/secrets/route.ts': () =>
    import('../workspaces/[wsId]/secrets/route'),
  'workspaces/[wsId]/tags/[tagId]/route.ts': () =>
    import('../workspaces/[wsId]/tags/[tagId]/route'),
  'workspaces/[wsId]/tags/route.ts': () =>
    import('../workspaces/[wsId]/tags/route'),
  'workspaces/[wsId]/tags/stats/route.ts': () =>
    import('../workspaces/[wsId]/tags/stats/route'),
  'workspaces/[wsId]/transactions/[transactionId]/route.ts': () =>
    import('../workspaces/[wsId]/transactions/[transactionId]/route'),
  'workspaces/[wsId]/transactions/[transactionId]/tags/route.ts': () =>
    import('../workspaces/[wsId]/transactions/[transactionId]/tags/route'),
  'workspaces/[wsId]/transactions/categories/[categoryId]/route.ts': () =>
    import('../workspaces/[wsId]/transactions/categories/[categoryId]/route'),
  'workspaces/[wsId]/transactions/categories/migrate/route.ts': () =>
    import('../workspaces/[wsId]/transactions/categories/migrate/route'),
  'workspaces/[wsId]/transactions/categories/route.ts': () =>
    import('../workspaces/[wsId]/transactions/categories/route'),
  'workspaces/[wsId]/transactions/category-breakdown/route.ts': () =>
    import('../workspaces/[wsId]/transactions/category-breakdown/route'),
  'workspaces/[wsId]/transactions/export/route.ts': () =>
    import('../workspaces/[wsId]/transactions/export/route'),
  'workspaces/[wsId]/transactions/import/money-lover/route.ts': () =>
    import('../workspaces/[wsId]/transactions/import/money-lover/route'),
  'workspaces/[wsId]/transactions/infinite/route.ts': () =>
    import('../workspaces/[wsId]/transactions/infinite/route'),
  'workspaces/[wsId]/transactions/periods/route.ts': () =>
    import('../workspaces/[wsId]/transactions/periods/route'),
  'workspaces/[wsId]/transactions/route.ts': () =>
    import('../workspaces/[wsId]/transactions/route'),
  'workspaces/[wsId]/transactions/spending-trends/route.ts': () =>
    import('../workspaces/[wsId]/transactions/spending-trends/route'),
  'workspaces/[wsId]/transactions/stats/route.ts': () =>
    import('../workspaces/[wsId]/transactions/stats/route'),
  'workspaces/[wsId]/transfers/route.ts': () =>
    import('../workspaces/[wsId]/transfers/route'),
  'workspaces/[wsId]/users/[userId]/route.ts': () =>
    import('../workspaces/[wsId]/users/[userId]/route'),
  'workspaces/[wsId]/users/indicators/groups/migrate/route.ts': () =>
    import('../workspaces/[wsId]/users/indicators/groups/migrate/route'),
  'workspaces/[wsId]/users/indicators/migrate/route.ts': () =>
    import('../workspaces/[wsId]/users/indicators/migrate/route'),
  'workspaces/[wsId]/users/route.ts': () =>
    import('../workspaces/[wsId]/users/route'),
  'workspaces/[wsId]/wallets/[walletId]/checkpoints/[checkpointId]/reconcile/route.ts':
    () =>
      import(
        '../workspaces/[wsId]/wallets/[walletId]/checkpoints/[checkpointId]/reconcile/route'
      ),
  'workspaces/[wsId]/wallets/[walletId]/checkpoints/[checkpointId]/route.ts':
    () =>
      import(
        '../workspaces/[wsId]/wallets/[walletId]/checkpoints/[checkpointId]/route'
      ),
  'workspaces/[wsId]/wallets/[walletId]/checkpoints/route.ts': () =>
    import('../workspaces/[wsId]/wallets/[walletId]/checkpoints/route'),
  'workspaces/[wsId]/wallets/[walletId]/credit-summary/route.ts': () =>
    import('../workspaces/[wsId]/wallets/[walletId]/credit-summary/route'),
  'workspaces/[wsId]/wallets/[walletId]/interest/calculate/route.ts': () =>
    import('../workspaces/[wsId]/wallets/[walletId]/interest/calculate/route'),
  'workspaces/[wsId]/wallets/[walletId]/interest/config/route.ts': () =>
    import('../workspaces/[wsId]/wallets/[walletId]/interest/config/route'),
  'workspaces/[wsId]/wallets/[walletId]/interest/project/route.ts': () =>
    import('../workspaces/[wsId]/wallets/[walletId]/interest/project/route'),
  'workspaces/[wsId]/wallets/[walletId]/interest/rates/route.ts': () =>
    import('../workspaces/[wsId]/wallets/[walletId]/interest/rates/route'),
  'workspaces/[wsId]/wallets/[walletId]/interest/route.ts': () =>
    import('../workspaces/[wsId]/wallets/[walletId]/interest/route'),
  'workspaces/[wsId]/wallets/[walletId]/route.ts': () =>
    import('../workspaces/[wsId]/wallets/[walletId]/route'),
  'workspaces/[wsId]/wallets/checkpoints/history/route.ts': () =>
    import('../workspaces/[wsId]/wallets/checkpoints/history/route'),
  'workspaces/[wsId]/wallets/checkpoints/route.ts': () =>
    import('../workspaces/[wsId]/wallets/checkpoints/route'),
  'workspaces/[wsId]/wallets/infinite/route.ts': () =>
    import('../workspaces/[wsId]/wallets/infinite/route'),
  'workspaces/[wsId]/wallets/migrate/route.ts': () =>
    import('../workspaces/[wsId]/wallets/migrate/route'),
  'workspaces/[wsId]/wallets/route.ts': () =>
    import('../workspaces/[wsId]/wallets/route'),
  'workspaces/[wsId]/wallets/transactions/migrate/route.ts': () =>
    import('../workspaces/[wsId]/wallets/transactions/migrate/route'),
  'workspaces/invitations/route.ts': () =>
    import('../workspaces/invitations/route'),
  'workspaces/route.ts': () => import('../workspaces/route'),
} satisfies LegacyApiRouteLoaderMap;
