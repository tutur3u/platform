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
      href: `/${wsId}/users`,
      matchExact: true,
    },
    {
      name: 'Database',
      href: `/${wsId}/users/list`,
    },
    {
      name: 'Groups',
      href: `/${wsId}/users/groups`,
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
