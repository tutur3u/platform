import { NavLink, Navigation } from '@/components/navigation';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import React from 'react';

interface LayoutProps {
  params: Promise<{
    wsId: string;
  }>;
  children: React.ReactNode;
}

export default async function Layout({ children, params }: LayoutProps) {
  const t = await getTranslations('workspace-inventory-tabs');
  const { wsId } = await params;

  const { withoutPermission } = await getPermissions({
    wsId,
  });

  if (withoutPermission('manage_inventory')) redirect(`/${wsId}`);

  const navLinks: NavLink[] = [
    {
      title: t('overview'),
      href: `/${wsId}/inventory`,
      matchExact: true,
      disabled: withoutPermission('manage_inventory'),
    },
    {
      title: t('products'),
      href: `/${wsId}/inventory/products`,
      disabled: withoutPermission('manage_inventory'),
    },
    {
      title: t('categories'),
      href: `/${wsId}/inventory/categories`,
      disabled: withoutPermission('manage_inventory'),
    },
    {
      title: t('units'),
      href: `/${wsId}/inventory/units`,
      disabled: withoutPermission('manage_inventory'),
    },
    {
      title: t('suppliers'),
      href: `/${wsId}/inventory/suppliers`,
      disabled: withoutPermission('manage_inventory'),
    },
    {
      title: t('warehouses'),
      href: `/${wsId}/inventory/warehouses`,
      disabled: withoutPermission('manage_inventory'),
    },
    {
      title: t('batches'),
      href: `/${wsId}/inventory/batches`,
      disabled: withoutPermission('manage_inventory'),
    },
    {
      title: t('promotions'),
      href: `/${wsId}/inventory/promotions`,
      disabled: withoutPermission('manage_inventory'),
    },
  ];

  return (
    <div>
      <Navigation navLinks={navLinks} />
      {children}
    </div>
  );
}
