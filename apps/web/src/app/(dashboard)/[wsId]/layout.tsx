import { NavLink, Navigation } from '@/components/navigation';
import { Separator } from '@/components/ui/separator';
import { getWorkspace, getWorkspaces } from '@/lib/workspace-helper';
import Image from 'next/image';
import Link from 'next/link';
import { Suspense } from 'react';
import WorkspaceSelect from './_components/workspace-select';
import { AI_CHAT_DISABLED_PRESETS } from '@/constants/common';

interface LayoutProps {
  params: {
    wsId?: string;
  };
  children: React.ReactNode;
}

export const dynamic = 'force-dynamic';

export default async function Layout({
  children,
  params: { wsId },
}: LayoutProps) {
  const workspace = await getWorkspace(wsId);
  const workspaces = await getWorkspaces();

  const navLinks: NavLink[] = [
    {
      name: 'Chat',
      href: `/${wsId}/chat`,
      disabledPresets: AI_CHAT_DISABLED_PRESETS,
    },
    {
      name: 'Dashboard',
      href: `/${wsId}`,
      matchExact: true,
    },
    {
      name: 'Users',
      href: `/${wsId}/users`,
    },
    {
      name: 'Documents',
      href: `/${wsId}/documents`,
      allowedPresets: ['ALL'],
    },
    {
      name: 'Boards',
      href: `/${wsId}/boards`,
      allowedPresets: ['ALL'],
    },
    {
      name: 'Inventory',
      href: `/${wsId}/inventory`,
    },
    {
      name: 'Healthcare',
      href: `/${wsId}/healthcare`,
      allowedPresets: ['ALL', 'PHARMACY'],
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
      aliases: [
        `/${wsId}/members`,
        `/${wsId}/teams`,
        `/${wsId}/infrastructure`,
        `/${wsId}/migrations`,
        `/${wsId}/activities`,
      ],
    },
  ];

  return (
    <>
      <div className="p-4 pb-2 font-semibold md:px-8 lg:px-16 xl:px-32">
        <div className="mb-2 flex items-center gap-4">
          <Link href="/">
            <Image
              src="/media/logos/transparent.png"
              width={320}
              height={320}
              alt="logo"
              className="h-7 w-7"
            />
          </Link>
          <div className="bg-foreground/20 h-4 w-[1px] rotate-[30deg]" />
          <Suspense fallback={<Link href={`/${wsId}`}>Loading...</Link>}>
            <WorkspaceSelect wsId={wsId} workspaces={workspaces} />
          </Suspense>
        </div>

        <div className="flex gap-1 overflow-x-auto">
          <Navigation
            currentPreset={workspace.preset ?? 'GENERAL'}
            navLinks={navLinks}
          />
        </div>
      </div>

      <Separator />

      <div className="p-4 pt-2 md:px-8 lg:px-16 xl:px-32">{children}</div>
    </>
  );
}
