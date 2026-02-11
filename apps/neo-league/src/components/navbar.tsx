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

export default function Navbar() {
  const desktopActions = (
    <div className="hidden items-center gap-2 md:flex">
      <Button
        variant="ghost"
        className="hover:bg-transparent hover:text-foreground/50"
        asChild
      >
        <Link href="#handbook">See Handbook</Link>
      </Button>
      <Button
        variant="ghost"
        className="hover:bg-transparent hover:text-foreground/50"
        asChild
      >
        <Link href="#contact">Contact Us</Link>
      </Button>
      <Button asChild className="btn-primary">
        <Link href="#register">Register Now</Link>
      </Button>
    </div>
  );

  const mobileActions = (
    <Sheet>
      <SheetTrigger className="flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-background/80 text-foreground shadow-sm transition hover:bg-foreground/5 active:scale-95 md:hidden">
        <MenuIcon className="h-5 w-5" />
        <span className="sr-only">Open navigation</span>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="flex h-full flex-col border-l bg-background/95 p-0 md:hidden"
      >
        <SheetHeader className="border-b px-6 pb-5 pt-6">
          <SheetTitle className="text-lg font-bold">Menu</SheetTitle>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-3 px-6 pb-8 pt-6">
          <SheetClose asChild>
            <Button
              variant="ghost"
              className="justify-start text-base hover:bg-foreground/5"
              asChild
            >
              <Link href="#handbook">See Handbook</Link>
            </Button>
          </SheetClose>
          <SheetClose asChild>
            <Button
              variant="ghost"
              className="justify-start text-base hover:bg-foreground/5"
              asChild
            >
              <Link href="#contact">Contact Us</Link>
            </Button>
          </SheetClose>
          <SheetClose asChild>
            <Button asChild className="btn-primary justify-center text-base">
              <Link href="#register">Register Now</Link>
            </Button>
          </SheetClose>
        </div>
      </SheetContent>
    </Sheet>
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
          {desktopActions}
          {mobileActions}
        </div>
      }
    />
  );
}
