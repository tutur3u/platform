import Link from 'next/link';
import Image from 'next/image';
import { UserNav } from './user-nav';
import NotificationPopover from './notification-popover';
import { ThemeToggle } from './theme-toggle';
import GetStartedButton from '@/components/layouts/GetStartedButton';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import WorkspaceSelect from './workspace-select';
import LogoTitle from './logo-title';
import { Suspense } from 'react';
import { getWorkspaces } from '@/lib/workspace-helper';
import { getCurrentUser } from '@/lib/user-helper';
import Navlinks from './navlinks';
import NavbarSeparator from './navbar-separator';

export default async function Navbar() {
  const supabase = createServerComponentClient({ cookies });

  const {
    data: { user: sbUser },
  } = await supabase.auth.getUser();

  const user = await getCurrentUser(true);
  const workspaces = await getWorkspaces(true);

  return (
    <div id="navbar" className="fixed inset-x-0 top-0 z-50">
      <div className="bg-background p-4 font-semibold md:px-8 lg:px-16 xl:px-32">
        <div className="relative flex items-center justify-between gap-2 md:gap-4">
          <div className="flex items-center gap-2">
            <Link href="/" className="flex flex-none items-center gap-2">
              <Image
                src="/media/logos/transparent.png"
                className="h-8 w-8"
                width={32}
                height={32}
                alt="logo"
              />
              <LogoTitle />
            </Link>

            <Suspense
              fallback={
                <div className="bg-foreground/5 h-10 w-32 animate-pulse rounded-lg" />
              }
            >
              {sbUser ? (
                <WorkspaceSelect user={user} workspaces={workspaces} />
              ) : null}
            </Suspense>
          </div>

          <Navlinks />

          <div className="flex items-center gap-2">
            <Suspense
              fallback={
                <div className="bg-foreground/5 h-10 w-32 animate-pulse rounded-lg" />
              }
            >
              {sbUser ? (
                <>
                  <NotificationPopover />
                  <UserNav />
                </>
              ) : (
                <>
                  <GetStartedButton />
                  <ThemeToggle />
                </>
              )}
            </Suspense>
          </div>
        </div>
      </div>
      <NavbarSeparator />
    </div>
  );
}
