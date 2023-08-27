import { Navigation } from './navigation';

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
      name: 'Home',
      href: '/',
    },
    {
      name: 'AI',
      href: '/ai',
    },
    {
      name: 'Dashboard',
      href: `/${wsId}`,
    },
    {
      name: 'Users',
      href: `/${wsId}/users`,
    },
    {
      name: 'Calendar',
      href: `/${wsId}/calendar`,
    },
    {
      name: 'Documents',
      href: `/${wsId}/documents`,
    },
    {
      name: 'Boards',
      href: `/${wsId}/boards`,
    },
    {
      name: 'Inventory',
      href: `/${wsId}/inventory`,
    },
    {
      name: 'Healthcare',
      href: `/${wsId}/healthcare`,
    },
    {
      name: 'Finance',
      href: `/${wsId}/finance`,
    },
    {
      name: 'Notifications',
      href: `/${wsId}/notifications`,
    },
    {
      name: 'Settings',
      href: `/${wsId}/settings`,
    },
  ];

  return (
    <div>
      <div className="flex gap-4 p-4 font-semibold md:px-8 lg:px-16 xl:px-32">
        <Navigation navLinks={navLinks} />
      </div>

      <div className="px-4 md:px-8 lg:px-16 xl:px-32">{children}</div>
    </div>
  );
}
