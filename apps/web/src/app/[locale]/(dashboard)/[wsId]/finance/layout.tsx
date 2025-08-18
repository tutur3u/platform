import { Navigation, type NavLink } from '@/components/navigation';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import type React from 'react';

interface LayoutProps {
  params: Promise<{
    wsId: string;
  }>;
  children: React.ReactNode;
}

export default async function Layout({ children, params }: LayoutProps) {
  const t = await getTranslations('workspace-finance-tabs');
  const { wsId: id } = await params;

  const workspace = await getWorkspace(id);
  const wsId = workspace.id;
  const correctedWSId = workspace.personal ? 'personal' : wsId;

  const { withoutPermission } = await getPermissions({
    wsId,
  });

  if (withoutPermission('manage_finance')) redirect(`/${wsId}`);

  const navLinks: NavLink[] = [
    {
      title: t('overview'),
      href: `/${correctedWSId}/finance`,
      matchExact: true,
      disabled: withoutPermission('manage_finance'),
    },
    {
      title: t('transactions'),
      href: `/${correctedWSId}/finance/transactions`,
      matchExact: true,
      disabled: withoutPermission('manage_finance'),
    },
    {
      title: t('wallets'),
      href: `/${correctedWSId}/finance/wallets`,
      disabled: withoutPermission('manage_finance'),
    },
    {
      title: t('categories'),
      href: `/${correctedWSId}/finance/transactions/categories`,
      disabled: withoutPermission('manage_finance'),
    },
    {
      title: t('invoices'),
      href: `/${correctedWSId}/finance/invoices`,
      disabled: withoutPermission('manage_finance'),
    },
    {
      title: t('settings'),
      href: `/${correctedWSId}/finance/settings`,
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
