import { NavLink, Navigation } from '@/components/navigation';
import { getSecrets, verifySecret } from '@/lib/workspace-helper';
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
  const { t } = useTranslation('workspace-finance-tabs');

  const secrets = await getSecrets({
    wsId,
    requiredSecrets: ['ENABLE_INVOICES'],
    forceAdmin: true,
  });

  const navLinks: NavLink[] = [
    {
      name: t('overview'),
      href: `/${wsId}/finance`,
      matchExact: true,
    },
    {
      name: t('transactions'),
      href: `/${wsId}/finance/transactions`,
      matchExact: true,
    },
    {
      name: t('wallets'),
      href: `/${wsId}/finance/wallets`,
    },
    {
      name: t('categories'),
      href: `/${wsId}/finance/transactions/categories`,
    },
    {
      name: t('invoices'),
      href: `/${wsId}/finance/invoices`,
      disabled: !verifySecret('ENABLE_INVOICES', 'true', secrets),
    },
    {
      name: t('settings'),
      href: `/${wsId}/finance/settings`,
      disabled: true,
    },
  ];

  return (
    <>
      <div className="scrollbar-none mb-4 flex gap-1 overflow-x-auto font-semibold">
        <Navigation navLinks={navLinks} />
      </div>
      {children}
    </>
  );
}
