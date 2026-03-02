'use client';

import { Button } from '@ncthub/ui/button';
import { MenuIcon, X } from '@ncthub/ui/icons';
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
  {
    href: 'https://www.canva.com/design/DAG_HV24rBs/QdeItbhyKHSFwDW5jLT-FA/view?utlId=hed84b4065d',
    label: 'See Handbook',
  },
  { href: '#contact', label: 'Contact Us' },
];

// detect external links once, reuse everywhere
const isExternal = (href: string) => href.startsWith('http');

const Navbar = () => {
  const renderLink = (href: string, label: string) => (
    <Link
      href={href}
      target={isExternal(href) ? '_blank' : undefined}
      rel={isExternal(href) ? 'noopener noreferrer' : undefined}
      prefetch={isExternal(href) ? false : undefined}
    >
      {label}
    </Link>
  );

  const DesktopActions = () => (
    <div className="hidden items-center gap-2 md:flex">
      {navItems.map((item) => (
        <Button
          key={item.href}
          variant="ghost"
          className="hover:bg-transparent hover:text-foreground/50"
          asChild
        >
          {renderLink(item.href, item.label)}
        </Button>
      ))}

      <Button asChild className="btn-primary">
        {renderLink(
          'https://forms.office.com/r/GdkwnUbty6?origin=lprLink',
          'Register Now'
        )}
      </Button>
    </div>
  );

  const MobileActions = () => (
    <div className="flex items-center gap-2 md:hidden">
      <Button asChild className="btn-primary">
        {renderLink(
          'https://forms.office.com/r/GdkwnUbty6?origin=lprLink',
          'Register Now'
        )}
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
              <X className="h-4 w-4" />
              <span className="sr-only">Close navigation</span>
            </SheetClose>
          </SheetHeader>

          <div className="flex flex-1 flex-col gap-3 px-6 pt-3 pb-8">
            {navItems.map((item) => (
              <SheetClose key={item.href} asChild>
                <Button
                  variant="ghost"
                  className="justify-start font-bold text-base hover:bg-foreground/5"
                  asChild
                >
                  {renderLink(item.href, item.label)}
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
};

export default Navbar;
