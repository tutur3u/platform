import { NavLink, Navigation } from '@/components/navigation';
import useTranslation from 'next-translate/useTranslation';

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

  const navLinks: NavLink[] = [
    {
      name: t('overview'),
      href: `/${wsId}/finance`,
      matchExact: true,
    },
    {
      name: t('wallets'),
      href: `/${wsId}/finance/wallets`,
    },
    {
      name: t('transactions'),
      href: `/${wsId}/finance/transactions`,
      matchExact: true,
    },
    {
      name: t('categories'),
      href: `/${wsId}/finance/transactions/categories`,
    },
    {
      name: t('invoices'),
      href: `/${wsId}/finance/invoices`,
      requireRootWorkspace: true,
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
