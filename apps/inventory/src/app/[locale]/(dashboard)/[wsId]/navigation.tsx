import {
  BarChart3,
  Boxes,
  Calculator,
  ClipboardList,
  CreditCard,
  Layers3,
  LayoutDashboard,
  MonitorSmartphone,
  PackageSearch,
  ReceiptText,
  Settings2,
  Store,
  TicketPercent,
} from '@tuturuuu/icons';
import { createWorkspaceMembersNavLink } from '@tuturuuu/satellite/workspace-settings';
import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import { getTranslations } from 'next-intl/server';
import {
  getInventoryNavigationItems,
  type InventoryNavigationItem,
} from './navigation-data';

export type { NavLink } from '@tuturuuu/ui/custom/navigation';

function getNavigationIcon(icon: InventoryNavigationItem['icon']) {
  const className = 'h-4 w-4';

  switch (icon) {
    case 'analytics':
      return <BarChart3 className={className} />;
    case 'audits':
      return <ClipboardList className={className} />;
    case 'bundles':
      return <Layers3 className={className} />;
    case 'catalog':
      return <PackageSearch className={className} />;
    case 'commerce':
      return <CreditCard className={className} />;
    case 'costing':
      return <Calculator className={className} />;
    case 'overview':
      return <LayoutDashboard className={className} />;
    case 'payments':
      return <CreditCard className={className} />;
    case 'posDevices':
      return <MonitorSmartphone className={className} />;
    case 'promotions':
      return <TicketPercent className={className} />;
    case 'sales':
      return <ReceiptText className={className} />;
    case 'setup':
      return <Settings2 className={className} />;
    case 'stock':
      return <Boxes className={className} />;
    case 'storefront':
      return <Store className={className} />;
  }
}

export async function getNavigationLinks({
  workspaceSlug,
}: {
  workspaceSlug: string;
}): Promise<(NavLink | null)[]> {
  const t = await getTranslations();
  const inventoryT = await getTranslations('inventory.nav');

  const links = getInventoryNavigationItems({ workspaceSlug }).map((item) => {
    if (!item) return null;

    return {
      title: inventoryT(item.titleKey),
      href: item.href,
      aliases: item.aliases,
      icon: getNavigationIcon(item.icon),
      matchExact: item.matchExact,
      sectionLabel: item.sectionKey ? inventoryT(item.sectionKey) : undefined,
    };
  });

  return [...links, null, createWorkspaceMembersNavLink(t)];
}
