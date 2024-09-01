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
  const t = await getTranslations('workspace-finance-tabs');

  const navLinks: NavLink[] = [
    {
      title: t('overview'),
      href: `/${wsId}/finance`,
      matchExact: true,
    },
    {
      title: t('transactions'),
      href: `/${wsId}/finance/transactions`,
      matchExact: true,
    },
    {
      title: t('wallets'),
      href: `/${wsId}/finance/wallets`,
    },
    {
      title: t('categories'),
      href: `/${wsId}/finance/transactions/categories`,
    },
    {
      title: t('invoices'),
      href: `/${wsId}/finance/invoices`,
    },
    {
      title: t('settings'),
      href: `/${wsId}/finance/settings`,
      disabled: true,
    },
  ];

  return (
    <>
      <Navigation navLinks={navLinks} />
      {children}
    </>
  );
}
