import { type NavLink, Navigation } from '@tuturuuu/ui/custom/navigation';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import type React from 'react';

interface FinanceLayoutProps {
  wsId: string;
  children: React.ReactNode;
}

export default async function FinanceLayout({ 
  children, 
  wsId 
}: FinanceLayoutProps) {
  const t = await getTranslations('workspace-finance-tabs');

  const { withoutPermission } = await getPermissions({
    wsId,
  });

  if (withoutPermission('manage_finance')) redirect(`/${wsId}`);

  const navLinks: NavLink[] = [
    {
      title: t('overview'),
      href: `/${wsId}/finance`,
      matchExact: true,
      disabled: withoutPermission('manage_finance'),
    },
    {
      title: t('transactions'),
      href: `/${wsId}/finance/transactions`,
      matchExact: true,
      disabled: withoutPermission('manage_finance'),
    },
    {
      title: t('wallets'),
      href: `/${wsId}/finance/wallets`,
      disabled: withoutPermission('manage_finance'),
    },
    {
      title: t('categories'),
      href: `/${wsId}/finance/transactions/categories`,
      disabled: withoutPermission('manage_finance'),
    },
    {
      title: t('invoices'),
      href: `/${wsId}/finance/invoices`,
      disabled: withoutPermission('manage_finance'),
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
