import type { ComponentType } from 'react';
import type { SidebarNavigationPlacement } from '../../app/[locale]/(dashboard)/[wsId]/sidebar-navigation-preferences';

export type LayoutScope = 'account' | 'workspace';

export interface NavigationItemDefinition {
  defaultPlacement: SidebarNavigationPlacement;
  icon: ComponentType<{ className?: string }>;
  id: string;
  locked?: boolean;
  sectionLabel: string;
  title: string;
}
