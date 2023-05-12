import { Translate } from 'next-translate';
import { NextRouter } from 'next/router';
import { Mode, NavTabs, Tab } from '../types/Tab';

import {
  financeTabs,
  healthcareTabs,
  infrastructureTabs,
  inventoryTabs,
  productDetailsTabs,
  settingsTabs,
  teamTabs,
  walletDetailsTabs,
  workspaceTabs,
  workspaceUsersTabs,
  wsUserDetailsTabs,
} from '../constants/tabs';
import { wsUserGroupDetailsTabs } from '../constants/tabs/workspace-group-details';

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

    case 'infrastructure':
      return infrastructureTabs;

    case 'wallet_details':
      return walletDetailsTabs;

    case 'product_details':
      return productDetailsTabs;

    case 'user_details':
      return wsUserDetailsTabs;

    case 'user_group_details':
      return wsUserGroupDetailsTabs;

    case 'team':
      return teamTabs;
  }
};

const enhanceHref = ({ router, tabs }: { router: NextRouter; tabs: Tab[] }) => {
  const { wsId, teamId, productId, userId, groupId, walletId } = router.query;

  return tabs.map((tab) => {
    if (tab.href) {
      const newHref = tab.href
        .replace('[wsId]', wsId as string)
        .replace('[teamId]', teamId as string)
        .replace('[userId]', userId as string)
        .replace('[productId]', productId as string)
        .replace('[userId]', userId as string)
        .replace('[groupId]', groupId as string)
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
