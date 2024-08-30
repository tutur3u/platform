import { NavLink, Navigation } from '@/components/navigation';
import { getTranslations } from 'next-intl/server';
import React from 'react';

interface LayoutProps {
  params: {
    wsId?: string;
  };
  children: React.ReactNode;
}

export default async function Layout({
  children,
  params: { wsId },
}: LayoutProps) {
  const t = await getTranslations('workspace-inventory-tabs');

  const navLinks: NavLink[] = [
    {
      title: t('overview'),
      href: `/${wsId}/inventory`,
      matchExact: true,
    },
    {
      title: t('products'),
      href: `/${wsId}/inventory/products`,
    },
    {
      title: t('categories'),
      href: `/${wsId}/inventory/categories`,
    },
    {
      title: t('units'),
      href: `/${wsId}/inventory/units`,
    },
    {
      title: t('suppliers'),
      href: `/${wsId}/inventory/suppliers`,
    },
    {
      title: t('warehouses'),
      href: `/${wsId}/inventory/warehouses`,
    },
    {
      title: t('batches'),
      href: `/${wsId}/inventory/batches`,
    },
    {
      title: t('promotions'),
      href: `/${wsId}/inventory/promotions`,
    },
  ];

  return (
    <div>
      <Navigation navLinks={navLinks} />
      {children}
    </div>
  );
}
