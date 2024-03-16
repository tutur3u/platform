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
import { usePathname } from 'next/navigation';

export default function Menu({
  sbUser,
  user,
}: {
  sbUser: User | null;
  user: any;
}) {
  const pathname = usePathname();
  const [isOpened, setIsOpened] = useState(false);

  return (
    <>
      <div className="hidden gap-8 font-semibold md:flex">
        <Link
          href="/"
          className={`h-fit ${
            pathname === '/' ? 'opacity-100' : 'opacity-50 hover:opacity-100'
          }`}
        >
          Home
        </Link>
        <Link
          href="/about"
          className={`h-fit ${
            pathname === '/about'
              ? 'opacity-100'
              : 'opacity-50 hover:opacity-100'
          }`}
        >
          About
        </Link>
        <Link
          href="/projects"
          className={`h-fit ${
            pathname === '/projects'
              ? 'opacity-100'
              : 'opacity-50 hover:opacity-100'
          }`}
        >
          Projects
        </Link>
        <Link
          href="/calendar/meet-together"
          className={`h-fit ${
            pathname === '/calendar/meet-together'
              ? 'opacity-100'
              : 'opacity-50 hover:opacity-100'
          }`}
        >
          Meet Together
        </Link>
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
              <Link
                href="/projects"
                className="border-brand-light-blue/20 bg-brand-light-blue/5 text-brand-light-blue rounded-lg border p-2 font-semibold"
                onClick={() => setIsOpened(false)}
              >
                Projects
              </Link>
              <Link
                href="/calendar/meet-together"
                className="border-brand-light-blue/20 bg-brand-light-blue/5 text-brand-light-blue rounded-lg border p-2 font-semibold"
                onClick={() => setIsOpened(false)}
              >
                Meet Together
              </Link>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
