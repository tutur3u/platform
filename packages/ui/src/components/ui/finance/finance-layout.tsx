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
  financePrefix?: string;
}

export default async function FinanceLayout({
  params,
  children,
  financePrefix = '/finance',
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
      href: `/${wsId}${financePrefix}`,
      matchExact: true,
      disabled: withoutPermission('manage_finance'),
    },
    {
      title: t('transactions'),
      href: `/${wsId}${financePrefix}/transactions`,
      matchExact: true,
      disabled: withoutPermission('manage_finance'),
    },
    {
      title: t('recurring'),
      href: `/${wsId}${financePrefix}/recurring`,
      disabled: withoutPermission('manage_finance'),
    },
    {
      title: t('wallets'),
      href: `/${wsId}${financePrefix}/wallets`,
      disabled: withoutPermission('manage_finance'),
    },
    {
      title: t('budgets'),
      href: `/${wsId}${financePrefix}/budgets`,
      disabled: withoutPermission('manage_finance'),
    },
    {
      title: t('analytics'),
      href: `/${wsId}${financePrefix}/analytics`,
      disabled: withoutPermission('manage_finance'),
    },
    {
      title: t('categories'),
      href: `/${wsId}${financePrefix}/transactions/categories`,
      disabled: withoutPermission('manage_finance'),
    },
    {
      title: t('tags'),
      href: `/${wsId}${financePrefix}/tags`,
      disabled: withoutPermission('manage_finance'),
    },
    {
      title: t('invoices'),
      href: `/${wsId}${financePrefix}/invoices`,
      disabled: withoutPermission('manage_finance'),
    },
    {
      title: t('settings'),
      href: `/${wsId}${financePrefix}/settings`,
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
