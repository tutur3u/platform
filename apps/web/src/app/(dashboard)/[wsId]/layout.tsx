import { Navigation } from '@/components/navigation';
import { Separator } from '@/components/ui/separator';
import { getWorkspace } from '@/lib/workspace-helper';
import Image from 'next/image';
import Link from 'next/link';
import { Suspense } from 'react';

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

  const navLinks = [
    {
      name: 'Home',
      href: '/',
      matchExact: true,
    },
    {
      name: 'Chat',
      href: '/chat',
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
    <>
      <div className="p-4 font-semibold md:px-8 lg:px-16 xl:px-32">
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
            <Link href={`/${workspace.id}`}>{workspace.name}</Link>
          </Suspense>
        </div>

        <div className="flex gap-1">
          <Navigation navLinks={navLinks} />
        </div>
      </div>

      <Separator />

      <div className="p-4 md:px-8 lg:px-16 xl:px-32">{children}</div>
    </>
  );
}
