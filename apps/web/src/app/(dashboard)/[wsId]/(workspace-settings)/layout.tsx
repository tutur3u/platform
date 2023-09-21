import { Navigation } from '@/components/navigation';
import { getWorkspace } from '@/lib/workspace-helper';

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
  const workspace = await getWorkspace(wsId);

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
      allowedRoles: ['ADMIN', 'OWNER'],
      requireRootWorkspace: true,
    },
    {
      name: 'Migrations',
      href: `/${wsId}/migrations`,
      allowedRoles: ['ADMIN', 'OWNER'],
      requireRootWorkspace: true,
    },
    {
      name: 'Activities',
      href: `/${wsId}/activities`,
      allowedRoles: ['ADMIN', 'OWNER'],
      requireRootWorkspace: true,
      disabled: true,
    },
  ];

  return (
    <div>
      <div className="mb-4 flex gap-1 overflow-x-auto font-semibold">
        <Navigation
          currentWsId={wsId}
          currentRole={workspace.role}
          navLinks={navLinks}
        />
      </div>
      {children}
    </div>
  );
}
