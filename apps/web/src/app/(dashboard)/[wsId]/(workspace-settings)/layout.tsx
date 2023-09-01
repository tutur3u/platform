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
      name: 'Workspace',
      href: `/${wsId}/settings`,
      matchExact: true,
    },
    {
      name: 'Members',
      href: `/${wsId}/members`,
    },
    {
      name: 'Teams',
      href: `/${wsId}/teams`,
      disabled: true,
    },
    {
      name: 'Infrastructure',
      href: `/${wsId}/infrastructure`,
      requireRootWorkspace: true,
    },
    {
      name: 'Migrations',
      href: `/${wsId}/migrations`,
      requireRootWorkspace: true,
    },
    {
      name: 'Activities',
      href: `/${wsId}/activities`,
      disabled: true,
    },
  ];

  return (
    <div>
      <div className="mb-4 flex gap-1 overflow-x-auto font-semibold">
        <Navigation currentWsId={wsId} navLinks={navLinks} />
      </div>
      {children}
    </div>
  );
}
