import { NavLink, Navigation } from '@/components/navigation';

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
  const navLinks: NavLink[] = [
    {
      name: 'Overview',
      href: `/${wsId}/inventory`,
      matchExact: true,
    },
    {
      name: 'Products',
      href: `/${wsId}/inventory/products`,
    },
    {
      name: 'Categories',
      href: `/${wsId}/inventory/categories`,
    },
    {
      name: 'Units',
      href: `/${wsId}/inventory/units`,
    },
    {
      name: 'Suppliers',
      href: `/${wsId}/inventory/suppliers`,
    },
    {
      name: 'Warehouses',
      href: `/${wsId}/inventory/warehouses`,
    },
    {
      name: 'Batches',
      href: `/${wsId}/inventory/batches`,
    },
    {
      name: 'Promotions',
      href: `/${wsId}/inventory/promotions`,
    },
  ];

  return (
    <div>
      <div className="mb-4 flex gap-1 overflow-x-auto font-semibold">
        <Navigation navLinks={navLinks} />
      </div>
      {children}
    </div>
  );
}
