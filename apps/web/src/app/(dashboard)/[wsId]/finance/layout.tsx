import { Navigation } from '@/components/navigation';

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
  const navLinks = [
    {
      name: 'Overview',
      href: `/${wsId}/finance`,
    },
    {
      name: 'Wallets',
      href: `/${wsId}/finance/wallets`,
    },
    {
      name: 'Transactions',
      href: `/${wsId}/finance/transactions`,
    },
    {
      name: 'Categories',
      href: `/${wsId}/finance/transactions/categories`,
    },
    {
      name: 'Invoices',
      href: `/${wsId}/finance/invoices`,
    },
    {
      name: 'Import',
      href: `/${wsId}/finance/import`,
    },
  ];

  return (
    <div>
      <div className="mb-4 flex gap-4 font-semibold">
        <Navigation navLinks={navLinks} />
      </div>
      {children}
    </div>
  );
}
