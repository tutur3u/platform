import LogoTitle from './logo-title';
import NavbarActions from './navbar-actions';
import NavbarSeparator from './navbar-separator';
import { MainNavigationMenu } from './navigation-menu';
import ServerMenu from './server-menu';
import WorkspaceSelect from './workspace-select';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import Link from 'next/link';
import { Suspense } from 'react';

export default function Navbar({
  hideMetadata = false,
  onlyOnMobile = false,
}: {
  hideMetadata?: boolean;
  onlyOnMobile?: boolean;
}) {
  return (
    <nav
      id="navbar"
      className={cn('fixed inset-x-0 top-0 z-50', onlyOnMobile && 'md:hidden')}
    >
      <div
        id="navbar-content"
        className="bg-transparent px-4 py-2 font-semibold md:px-8 lg:px-16 xl:px-32"
      >
        <div className="relative flex items-center justify-between gap-2 md:gap-4">
          <div className="flex w-full items-center gap-2">
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
              <WorkspaceSelect />
            </Suspense>

            <div className="ml-4 hidden w-full md:block">
              <MainNavigationMenu />
            </div>
          </div>

          <div className="flex w-fit flex-none flex-row-reverse items-center gap-2 md:flex-row md:justify-between">
            <Suspense>
              <ServerMenu />
            </Suspense>

            <Suspense
              fallback={
                <div className="bg-foreground/5 h-10 w-[88px] animate-pulse rounded-lg" />
              }
            >
              <NavbarActions hideMetadata={hideMetadata} />
            </Suspense>
          </div>
        </div>
      </div>
      <NavbarSeparator />
    </nav>
  );
}
