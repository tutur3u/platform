import {
  BadgeDollarSign,
  Boxes,
  ClipboardList,
  CreditCard,
  Layers3,
  LayoutDashboard,
  PackageSearch,
  ShieldCheck,
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
      title: t('items.title'),
      description: t('items.description'),
      href: `/${workspaceSlug}/items`,
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
      title: t('checkout.title'),
      description: t('checkout.description'),
      href: `/${workspaceSlug}/checkout`,
      icon: <CreditCard className="h-4 w-4" />,
    },
    {
      title: t('audits.title'),
      description: t('audits.description'),
      href: `/${workspaceSlug}/audits`,
      icon: <ClipboardList className="h-4 w-4" />,
    },
    {
      title: t('stripe.title'),
      description: t('stripe.description'),
      href: `/${workspaceSlug}/stripe`,
      icon: <BadgeDollarSign className="h-4 w-4" />,
    },
    {
      title: t('controls.title'),
      description: t('controls.description'),
      href: `/${workspaceSlug}/audits`,
      icon: <ShieldCheck className="h-4 w-4" />,
    },
  ];
}
