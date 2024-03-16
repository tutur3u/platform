'use client';

import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { User } from '@supabase/supabase-js';
import { MenuIcon } from 'lucide-react';
import { useState } from 'react';
import { ThemeToggle } from './theme-toggle';
import { DefaultUserDropdown } from './user-dropdown';
import AuthButton from './auth-button';
import Link from 'next/link';

export default function Menu({
  sbUser,
  user,
}: {
  sbUser: User | null;
  user: any;
}) {
  const [isOpened, setIsOpened] = useState(false);

  return (
    <>
      <div className="hidden gap-4 font-semibold md:flex">
        <Link href="/" className="h-fit opacity-50 hover:opacity-100">
          Home
        </Link>
        <Link href="/about" className="h-fit opacity-50 hover:opacity-100">
          About
        </Link>
        <div className="h-fit cursor-not-allowed opacity-20">Members</div>
        <div className="h-fit cursor-not-allowed opacity-20">Projects</div>
      </div>

      <div className="hidden gap-1 md:flex">
        {user ? (
          <DefaultUserDropdown user={user} />
        ) : (
          <>
            <AuthButton user={sbUser} />
            <ThemeToggle />
          </>
        )}
      </div>

      <div className="flex gap-2 md:hidden">
        {user ? <DefaultUserDropdown user={user} /> : null}
        <Sheet open={isOpened} onOpenChange={setIsOpened}>
          <SheetTrigger className="border-brand-light-blue/20 bg-brand-light-blue/5 text-brand-light-blue hover:bg-brand-light-blue/10 rounded-lg border p-2 font-semibold transition">
            <MenuIcon className="h-5 w-5" />
          </SheetTrigger>
          <SheetContent className="md:hidden">
            <div
              className={cn('mt-6 items-center gap-1', user ? 'grid' : 'flex')}
            >
              <AuthButton
                user={sbUser}
                className="w-full items-center justify-center"
                onClick={() => setIsOpened(false)}
              />
              {user ? null : <ThemeToggle />}
            </div>

            <Separator className="my-4" />

            <div className="grid gap-2 text-center font-semibold">
              <Link
                href="/"
                className="border-brand-light-blue/20 bg-brand-light-blue/5 text-brand-light-blue rounded-lg border p-2 font-semibold"
                onClick={() => setIsOpened(false)}
              >
                Home
              </Link>
              <Link
                href="/about"
                className="border-brand-light-blue/20 bg-brand-light-blue/5 text-brand-light-blue rounded-lg border p-2 font-semibold"
                onClick={() => setIsOpened(false)}
              >
                About
              </Link>
              <div className="border-brand-light-blue/20 bg-brand-light-blue/5 text-brand-light-blue cursor-not-allowed rounded-lg border p-2 font-semibold opacity-50">
                Members
              </div>
              <div className="border-brand-light-blue/20 bg-brand-light-blue/5 text-brand-light-blue cursor-not-allowed rounded-lg border p-2 font-semibold opacity-50">
                Projects
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
