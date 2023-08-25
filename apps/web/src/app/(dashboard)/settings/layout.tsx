import { Navigation } from '../[wsId]/navigation';

interface LayoutProps {
  children: React.ReactNode;
}

export default async function Layout({ children }: LayoutProps) {
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
      name: 'Account',
      href: '/settings',
    },
    {
      name: 'Appearance',
      href: '/settings/appearance',
    },
    {
      name: 'Notifications',
      href: '/settings/notifications',
    },
    {
      name: 'Workspaces',
      href: '/settings/workspaces',
    },
    {
      name: 'Activities',
      href: '/settings/activities',
    },
  ];

  return (
    <div>
      <div className="flex gap-4 p-4 font-semibold md:px-8 lg:px-16 xl:px-32">
        <Navigation navLinks={navLinks} />
      </div>

      <div className="p-4 md:p-8 lg:p-16 xl:px-32">{children}</div>
    </div>
  );
}
