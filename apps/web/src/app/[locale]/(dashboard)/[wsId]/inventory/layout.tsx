import { NavLink, Navigation } from '@/components/navigation';
import useTranslation from 'next-translate/useTranslation';
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
  const { t } = useTranslation('workspace-inventory-tabs');

  const navLinks: NavLink[] = [
    {
      name: t('overview'),
      href: `/${wsId}/inventory`,
      matchExact: true,
    },
    {
      name: t('products'),
      href: `/${wsId}/inventory/products`,
    },
    {
      name: t('categories'),
      href: `/${wsId}/inventory/categories`,
    },
    {
      name: t('units'),
      href: `/${wsId}/inventory/units`,
    },
    {
      name: t('suppliers'),
      href: `/${wsId}/inventory/suppliers`,
    },
    {
      name: t('warehouses'),
      href: `/${wsId}/inventory/warehouses`,
    },
    {
      name: t('batches'),
      href: `/${wsId}/inventory/batches`,
    },
    {
      name: t('promotions'),
      href: `/${wsId}/inventory/promotions`,
    },
  ];

  return (
    <div>
      <div className="scrollbar-none mb-4 flex gap-1 overflow-x-auto font-semibold">
        <Navigation navLinks={navLinks} />
      </div>
      {children}
    </div>
  );
}
