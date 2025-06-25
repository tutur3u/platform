import { LogoTitle } from '@tuturuuu/ui/custom/logo-title';
import { cn } from '@tuturuuu/utils/format';
import Image from 'next/image';
import Link from 'next/link';
import { Suspense } from 'react';
import NavbarActions from './navbar-actions';
import NavbarSeparator from './navbar-separator';
import ServerMenu from './server-menu';

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
      <div className="bg-background px-4 py-2 font-semibold md:px-8 lg:px-16 xl:px-32">
        <div className="relative flex w-full items-center justify-between gap-2 md:gap-8">
          <div className="flex flex-none items-center gap-2">
            <Link href="/" className="flex flex-none items-center gap-2">
              <Image
                src="/media/logos/transparent.png"
                className="h-8 w-8"
                width={32}
                height={32}
                alt="logo"
              />
              <LogoTitle
                text="Rewise"
                className={cn(
                  'bg-linear-to-r from-dynamic-light-red via-dynamic-light-pink to-dynamic-light-blue bg-clip-text py-1 text-transparent',
                  'text-4xl font-bold md:text-3xl lg:text-4xl'
                )}
              />
            </Link>
          </div>

          <div className="flex w-full flex-row-reverse items-center gap-2 md:flex-row md:justify-end">
            <Suspense>
              <ServerMenu />
            </Suspense>

            <Suspense
              fallback={
                <div className="h-10 w-[88px] animate-pulse rounded-lg bg-foreground/5" />
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
