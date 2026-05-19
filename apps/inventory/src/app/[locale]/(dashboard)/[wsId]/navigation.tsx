import {
  Boxes,
  ClipboardList,
  CreditCard,
  Layers3,
  LayoutDashboard,
  PackageSearch,
  Settings2,
  ShieldCheck,
  Store,
} from '@tuturuuu/icons';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

export type InventoryNavLink = {
  description: string;
  href: string;
  icon: ReactNode;
  title: string;
};

export async function getNavigationLinks({
  workspaceSlug,
}: {
  workspaceSlug: string;
}): Promise<InventoryNavLink[]> {
  const t = await getTranslations('inventory.nav');

  return [
    {
      title: t('overview.title'),
      description: t('overview.description'),
      href: `/${workspaceSlug}`,
      icon: <LayoutDashboard className="h-4 w-4" />,
    },
    {
      title: t('catalog.title'),
      description: t('catalog.description'),
      href: `/${workspaceSlug}/catalog`,
      icon: <PackageSearch className="h-4 w-4" />,
    },
    {
      title: t('stock.title'),
      description: t('stock.description'),
      href: `/${workspaceSlug}/stock`,
      icon: <Boxes className="h-4 w-4" />,
    },
    {
      title: t('bundles.title'),
      description: t('bundles.description'),
      href: `/${workspaceSlug}/bundles`,
      icon: <Layers3 className="h-4 w-4" />,
    },
    {
      title: t('checkouts.title'),
      description: t('checkouts.description'),
      href: `/${workspaceSlug}/checkouts`,
      icon: <CreditCard className="h-4 w-4" />,
    },
    {
      title: t('sales.title'),
      description: t('sales.description'),
      href: `/${workspaceSlug}/sales`,
      icon: <ShieldCheck className="h-4 w-4" />,
    },
    {
      title: t('setup.title'),
      description: t('setup.description'),
      href: `/${workspaceSlug}/setup`,
      icon: <Settings2 className="h-4 w-4" />,
    },
    {
      title: t('audits.title'),
      description: t('audits.description'),
      href: `/${workspaceSlug}/audits`,
      icon: <ClipboardList className="h-4 w-4" />,
    },
    {
      title: t('storefront.title'),
      description: t('storefront.description'),
      href: `/${workspaceSlug}/storefront`,
      icon: <Store className="h-4 w-4" />,
    },
  ];
}
