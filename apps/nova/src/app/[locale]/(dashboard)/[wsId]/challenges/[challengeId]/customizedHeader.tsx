import ProblemChanger from './problem-changer';
import LogoTitle from '@/app/[locale]/(marketing)/logo-title';
import NavbarSeparator from '@/app/[locale]/(marketing)/navbar-separator';
import { Button } from '@repo/ui/components/ui/button';
import { cn } from '@repo/ui/lib/utils';
import Image from 'next/image';
import Link from 'next/link';
import React from 'react';
import { Suspense } from 'react';

export default function CustomizedHeader() {
  return (
    <nav
      id="navbar"
      className={cn('fixed inset-x-0 top-0 z-50 bg-white shadow-sm')}
    >
      <div className="container mx-auto px-4 py-2 font-semibold">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link href="/" className="flex items-center gap-2">
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

          <div className="flex flex-1 items-center justify-center">
            <ProblemChanger />
          </div>

          <div className="flex items-center gap-4">
            <Suspense
              fallback={
                <div className="bg-foreground/5 h-10 w-[88px] animate-pulse rounded-lg" />
              }
            >
              <Button variant="outline">Home</Button>
              <Button variant="outline">Profile</Button>
            </Suspense>
          </div>
        </div>
      </div>
      <NavbarSeparator />
    </nav>
  );
}
