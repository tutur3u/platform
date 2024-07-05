import LogoTitle from './logo-title';
import NavbarActions from './navbar-actions';
import NavbarSeparator from './navbar-separator';
import ServerMenu from './server-menu';
import WorkspaceSelect from './workspace-select';
import Image from 'next/image';
import Link from 'next/link';
import { Suspense } from 'react';

export default function Navbar() {
  return (
    <nav id="navbar" className="fixed inset-x-0 top-0 z-50">
      <div className="bg-background px-4 py-2 font-semibold md:px-8 lg:px-16 xl:px-32">
        <div className="relative flex items-center justify-between gap-2 md:gap-8">
          <div className="flex flex-none items-center gap-2">
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
          </div>

          <div className="flex w-full flex-row-reverse items-center gap-2 md:flex-row md:justify-between">
            <div />

            <Suspense>
              <ServerMenu />
            </Suspense>

            <Suspense
              fallback={
                <div className="bg-foreground/5 h-10 w-[88px] animate-pulse rounded-lg" />
              }
            >
              <NavbarActions />
            </Suspense>
          </div>
        </div>
      </div>
      <NavbarSeparator />
    </nav>
  );
}
