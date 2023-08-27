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
      name: 'Workspace',
      href: `/${wsId}/settings`,
    },
    {
      name: 'Members',
      href: `/${wsId}/settings/members`,
    },
    {
      name: 'Teams',
      href: `/${wsId}/settings/teams`,
    },
    {
      name: 'Infrastructure',
      href: `/${wsId}/infrastructure`,
    },
    {
      name: 'Migrations',
      href: `/${wsId}/migrations`,
    },
    {
      name: 'Activities',
      href: `/${wsId}/activities`,
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
