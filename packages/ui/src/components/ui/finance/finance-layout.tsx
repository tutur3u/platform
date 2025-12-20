import { Navigation, type NavLink } from '@tuturuuu/ui/custom/navigation';
import { QuickActions } from '@tuturuuu/ui/finance/shared/quick-actions';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type React from 'react';

interface FinanceLayoutProps {
  params: Promise<{
    wsId: string;
  }>;
  children: React.ReactNode;
}

export default async function FinanceLayout({
  params,
  children,
}: FinanceLayoutProps) {
  const { wsId } = await params;
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
      title: t('recurring'),
      href: `/${wsId}/finance/recurring`,
      disabled: withoutPermission('manage_finance'),
    },
    {
      title: t('wallets'),
      href: `/${wsId}/finance/wallets`,
      disabled: withoutPermission('manage_finance'),
    },
    {
      title: t('budgets'),
      href: `/${wsId}/finance/budgets`,
      disabled: withoutPermission('manage_finance'),
    },
    {
      title: t('analytics'),
      href: `/${wsId}/finance/analytics`,
      disabled: withoutPermission('manage_finance'),
    },
    {
      title: t('categories'),
      href: `/${wsId}/finance/transactions/categories`,
      disabled: withoutPermission('manage_finance'),
    },
    {
      title: t('tags'),
      href: `/${wsId}/finance/tags`,
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
      <QuickActions wsId={wsId} />
    </>
  );
}
