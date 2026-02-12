'use client';

import { Button } from '@ncthub/ui/button';
import { MenuIcon } from '@ncthub/ui/icons';
import { Navbar as SharedNavbar } from '@ncthub/ui/navbar';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@ncthub/ui/sheet';
import Image from 'next/image';
import Link from 'next/link';
import NavbarSeparator from './navbar-separator';

const navItems = [
  { href: '#handbook', label: 'See Handbook' },
  { href: '#contact', label: 'Contact Us' },
];

export default function Navbar() {
  const DesktopActions = () => (
    <div className="hidden items-center gap-2 md:flex">
      {navItems.map((item) => (
        <Button
          key={item.href}
          variant="ghost"
          className="hover:bg-transparent hover:text-foreground/50"
          asChild
        >
          <Link href={item.href}>{item.label}</Link>
        </Button>
      ))}

      <Button asChild className="btn-primary">
        <Link href="#register">Register Now</Link>
      </Button>
    </div>
  );

  const MobileActions = () => (
    <div className="flex items-center gap-2 md:hidden">
      <Button asChild className="btn-primary">
        <Link href="#register">Register Now</Link>
      </Button>
      <Sheet>
        <SheetTrigger className="flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-background/80 text-foreground shadow-sm transition hover:bg-foreground/5 active:scale-95">
          <MenuIcon className="h-5 w-5" />
          <span className="sr-only">Open navigation</span>
        </SheetTrigger>

        <SheetContent
          side="right"
          className="flex h-full flex-col border-l bg-background/95 p-0 [&>button]:hidden"
        >
          <SheetHeader className="flex-row items-center justify-between border-b px-6 py-6">
            <SheetTitle className="font-bold text-lg">Menu</SheetTitle>
            <SheetClose className="rounded-md p-2 text-foreground/80 transition hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <XIcon className="h-4 w-4" />
              <span className="sr-only">Close navigation</span>
            </SheetClose>
          </SheetHeader>
          <div className="flex flex-1 flex-col gap-3 px-6 pt-6 pb-8">
            {navItems.map((item) => (
              <SheetClose key={item.href} asChild>
                <Button
                  variant="ghost"
                  className="justify-start text-base hover:bg-foreground/5"
                  asChild
                >
                  <Link href={item.href}>{item.label}</Link>
                </Button>
              </SheetClose>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );

  return (
    <SharedNavbar
      customLogoLink={
        <Link href="/" className="flex flex-none items-center gap-2">
          <Image
            src="/monkey-mascot.png"
            className="h-14 w-auto md:h-16 lg:h-20"
            width={350}
            height={100}
            alt="NEO League Logo"
          />
        </Link>
      }
      separator={<NavbarSeparator />}
      actions={
        <div className="flex items-center gap-2">
          <DesktopActions />
          <MobileActions />
        </div>
      }
    />
  );
}
