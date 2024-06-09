import LogoTitle from './logo-title';
import NavbarSeparator from './navbar-separator';
import Navlinks from './navlinks';
import NotificationPopover from './notification-popover';
import { ThemeToggle } from './theme-toggle';
import { UserNav } from './user-nav';
import WorkspaceSelect from './workspace-select';
import GetStartedButton from '@/components/layouts/GetStartedButton';
import { getCurrentUser } from '@/lib/user-helper';
import { getWorkspaces } from '@/lib/workspace-helper';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import Image from 'next/image';
import Link from 'next/link';
import { Suspense } from 'react';

export default async function Navbar() {
  const supabase = createServerComponentClient({ cookies });

  const {
    data: { user: sbUser },
  } = await supabase.auth.getUser();

  const user = await getCurrentUser(true);
  const workspaces = await getWorkspaces(true);

  return (
    <div id="navbar" className="fixed inset-x-0 top-0 z-50">
      <div className="bg-background px-4 py-2 font-semibold md:px-8 lg:px-16 xl:px-32">
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

          <Suspense
            fallback={
              <div className="bg-foreground/5 h-10 w-[88px] animate-pulse rounded-lg" />
            }
          >
            <div className="flex items-center gap-2">
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
            </div>
          </Suspense>
        </div>
      </div>
      <NavbarSeparator />
    </div>
  );
}
