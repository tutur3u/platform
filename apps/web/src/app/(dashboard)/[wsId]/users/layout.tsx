import { Navigation } from '../navigation';

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
      <div className="mb-4 flex gap-4 font-semibold">
        <Navigation navLinks={navLinks} />
      </div>
      {children}
    </div>
  );
}
