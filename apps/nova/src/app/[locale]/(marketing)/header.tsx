import { Separator } from '@repo/ui/components/ui/separator';
import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import LogoTitle from './logo-title';
import NavbarSeparator from './navbar-separator';
import { Suspense } from 'react';
import NavbarActions from './navbar-actions';

export default function Header() {
  return (
    <nav
      id="navbar"
      className={cn('fixed inset-x-0 top-0 z-50')}
    >
      <div className="bg-background px-4 py-2 font-semibold md:px-8 lg:px-16 xl:px-32">
        <div className="relative flex w-full items-center justify-between gap-2 md:gap-8">
          {/* Logo and Title Section */}
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
          </div>

          {/* Navbar Actions Section */}
          <div className="flex w-full flex-row-reverse items-center gap-2 md:flex-row md:justify-end">
            <Suspense>
              {/* Optional: Add ServerMenu if needed */}
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
