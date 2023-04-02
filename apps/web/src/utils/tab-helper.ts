import { Translate } from 'next-translate';
import { NextRouter } from 'next/router';
import { Mode, NavTabs, Tab } from '../types/Tab';
import { settingsTabs } from '../constants/tabs/settings';
import { workspaceTabs } from '../constants/tabs/workspace';
import { workspaceUsersTabs } from '../constants/tabs/workspace-users';
import { financeTabs } from '../constants/tabs/finance';
import { healthcareTabs } from '../constants/tabs/healthcare';
import { inventoryTabs } from '../constants/tabs/inventory';
import { productDetailsTabs } from '../constants/tabs/product-details';
import { teamTabs } from '../constants/tabs/team';
import { wsUserDetailsTabs } from '../constants/tabs/workspace-user-details';
import { walletDetailsTabs } from '../constants/tabs/wallet-details';

export const getNavTabs = (mode: Mode) => {
  switch (mode) {
    case 'settings':
      return settingsTabs;

    case 'workspace':
      return workspaceTabs;

    case 'workspace_users':
      return workspaceUsersTabs;

    case 'healthcare':
      return healthcareTabs;

    case 'inventory':
      return inventoryTabs;

    case 'finance':
      return financeTabs;

    case 'wallet_details':
      return walletDetailsTabs;

    case 'product_details':
      return productDetailsTabs;

    case 'user_details':
      return wsUserDetailsTabs;

    case 'team':
      return teamTabs;
  }
};

const enhanceHref = ({ router, tabs }: { router: NextRouter; tabs: Tab[] }) => {
  const { wsId, teamId, userId, productId, patientId, walletId } = router.query;

  return tabs.map((tab) => {
    if (tab.href) {
      const newHref = tab.href
        .replace('[wsId]', wsId as string)
        .replace('[teamId]', teamId as string)
        .replace('[userId]', userId as string)
        .replace('[productId]', productId as string)
        .replace('[patientId]', patientId as string)
        .replace('[walletId]', walletId as string);

      return {
        ...tab,
        href: newHref.replace(/\/$/, ''),
      };
    }

    return tab;
  });
};

const getLocalizedTabs = ({ tabs, namespace }: NavTabs, t: Translate) => {
  return tabs.map((tab) => ({
    ...tab,
    name: t(`${namespace}:${tab.name}`),
  }));
};

export const getTabs = ({
  t,
  router,
  mode,
}: {
  t: Translate;
  router: NextRouter;
  mode: Mode;
}) => {
  const navTabs = getNavTabs(mode);
  const tabs = getLocalizedTabs(navTabs, t);

  return enhanceHref({ router, tabs });
};
