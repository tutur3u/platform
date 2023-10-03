import { NavLink, Navigation } from '@/components/navigation';

export const dynamic = 'force-dynamic';

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
    {
      name: 'Reports',
      href: `/${wsId}/users/reports`,
      allowedPresets: ['EDUCATION'],
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
