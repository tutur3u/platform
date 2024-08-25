import { NavLink, Navigation } from '@/components/navigation';
import { getSecrets, verifySecret } from '@/lib/workspace-helper';
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

  const secrets = await getSecrets({
    wsId,
    requiredSecrets: ['ENABLE_INVOICES'],
    forceAdmin: true,
  });

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
      disabled: !verifySecret('ENABLE_INVOICES', 'true', secrets),
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
