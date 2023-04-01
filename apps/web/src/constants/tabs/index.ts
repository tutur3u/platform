import { Mode } from '../../types/Tab';
import { financeTabs } from './finance';
import { healthcareTabs } from './healthcare';
import { inventoryTabs } from './inventory';
import { productDetailsTabs } from './product-details';
import { settingsTabs } from './settings';
import { teamTabs } from './team';
import { workspaceTabs } from './workspace';
import { wsUserDetailsTabs } from './workspace-user-details';
import { workspaceUsersTabs } from './workspace-users';

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

    case 'product_details':
      return productDetailsTabs;

    case 'user_details':
      return wsUserDetailsTabs;

    case 'team':
      return teamTabs;
  }
};
