import { Separator } from '@/components/ui/separator';
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

export default async function Navbar() {
  const supabase = createServerComponentClient({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const workspaces = await getWorkspaces(true);

  return (
    <div id="navbar" className="fixed inset-x-0 top-0 z-10">
      <div className="bg-background/30 px-4 py-2 font-semibold backdrop-blur-lg md:px-8 lg:px-16 xl:px-32">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex flex-none items-center gap-2">
              <Image
                src="/media/logos/transparent.png"
                className="h-6 w-6 md:h-8 md:w-8"
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
              {user ? <WorkspaceSelect workspaces={workspaces} /> : null}
            </Suspense>
          </div>

          <div className="flex items-center gap-2">
            <Suspense
              fallback={
                <div className="bg-foreground/5 h-10 w-32 animate-pulse rounded-lg" />
              }
            >
              {user ? (
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
      <Separator />
    </div>
  );
}
