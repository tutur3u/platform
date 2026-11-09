import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import type { ReactNode } from 'react';
import type { DashboardNavigationIconName } from './navigation-icons';

const DASHBOARD_NAVIGATION_ICON_DESCRIPTOR = 'dashboard-navigation-icon';

export interface DashboardNavigationIconDescriptor {
  className?: string;
  kind: typeof DASHBOARD_NAVIGATION_ICON_DESCRIPTOR;
  name: DashboardNavigationIconName;
}

export type DashboardNavigationLink = Omit<
  NavLink,
  'children' | 'icon' | 'preferenceArchivedItems'
> & {
  children?: (DashboardNavigationLink | null)[];
  icon?: DashboardNavigationIconDescriptor | ReactNode;
  preferenceArchivedItems?: DashboardNavigationLink[];
};

export function createDashboardNavigationIcon(
  name: DashboardNavigationIconName,
  className?: string
): DashboardNavigationIconDescriptor {
  return {
    className,
    kind: DASHBOARD_NAVIGATION_ICON_DESCRIPTOR,
    name,
  };
}

export function isDashboardNavigationIconDescriptor(
  icon: unknown
): icon is DashboardNavigationIconDescriptor {
  return (
    typeof icon === 'object' &&
    icon !== null &&
    'kind' in icon &&
    icon.kind === DASHBOARD_NAVIGATION_ICON_DESCRIPTOR
  );
}
