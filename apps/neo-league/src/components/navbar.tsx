'use client';

import { Button } from '@ncthub/ui/button';
import { MenuIcon, X } from '@ncthub/ui/icons';
import { Navbar as SharedNavbar } from '@ncthub/ui/navbar';
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from '@ncthub/ui/navigation-menu';
import { Separator } from '@ncthub/ui/separator';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@ncthub/ui/sheet';
import { cn } from '@ncthub/utils/format';
import Image from 'next/image';
import Link from 'next/link';
import { navigationItems } from '@/config/navigation';
import NavbarSeparator from './navbar-separator';

function handleSmoothScroll(
  e: React.MouseEvent<HTMLAnchorElement>,
  href: string
) {
  e.preventDefault();
  const targetId = href.replace('#', '');
  const element = document.querySelector(`#${targetId}`);
  if (element) {
    element.scrollIntoView({ behavior: 'smooth' });
  }
}

function DesktopNavLinks() {
  return (
    <div className="flex w-full items-center justify-center">
      <NavigationMenu className="scrollbar-none flex w-4/5 max-w-none flex-none justify-between overflow-x-auto">
        <NavigationMenuList>
          {navigationItems.map((item) => (
            <NavigationMenuItem key={item.href}>
              <NavigationMenuLink
                href={item.href}
                onClick={(e) => handleSmoothScroll(e, item.href)}
                className={cn(
                  navigationMenuTriggerStyle(),
                  'bg-transparent px-4 font-semibold transition-all duration-300 hover:bg-foreground/5'
                )}
              >
                {item.label}
              </NavigationMenuLink>
            </NavigationMenuItem>
          ))}
        </NavigationMenuList>
      </NavigationMenu>
    </div>
  );
}

function DesktopActions() {
  return (
    <div className="hidden items-center gap-2 md:flex">
      <Button
        asChild
        className="hover:bg-transparent hover:text-foreground/50"
        variant="ghost"
      >
        <Link
          href="https://www.canva.com/design/DAG_HV24rBs/QdeItbhyKHSFwDW5jLT-FA/view?utlId=hed84b4065d"
          target="_blank"
          rel="noopener noreferrer"
          prefetch={false}
        >
          See Handbook
        </Link>
      </Button>

      <Button
        className="hover:bg-transparent hover:text-foreground/50"
        variant="ghost"
      >
        <Link
          href="#contact"
          onClick={(e) => {
            e.preventDefault();
            document
              .querySelector('#contact')
              ?.scrollIntoView({ behavior: 'smooth' });
          }}
        >
          Contact Us
        </Link>
      </Button>

      <Button asChild className="btn-primary">
        <Link
          href="https://forms.office.com/r/GdkwnUbty6?origin=lprLink"
          target="_blank"
          rel="noopener noreferrer"
          prefetch={false}
        >
          Register Now
        </Link>
      </Button>
    </div>
  );
}

function MobileActions() {
  return (
    <div className="flex items-center gap-2 md:hidden">
      <Button asChild className="btn-primary">
        <Link
          href="https://forms.office.com/r/GdkwnUbty6?origin=lprLink"
          target="_blank"
          rel="noopener noreferrer"
          prefetch={false}
        >
          Register Now
        </Link>
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
          <SheetHeader className="flex-row items-center justify-between border-foreground/10 border-b px-6 py-6">
            <SheetTitle className="font-bold text-lg">Menu</SheetTitle>
            <SheetClose className="rounded-md p-2 text-foreground/80 transition hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <X className="h-4 w-4" />
              <span className="sr-only">Close navigation</span>
            </SheetClose>
          </SheetHeader>

          <div className="flex flex-1 flex-col overflow-hidden px-6 pt-3 pb-8">
            <div className="flex flex-1 flex-col items-start gap-1 overflow-y-auto">
              {navigationItems.map((item) => (
                <SheetClose key={item.href} asChild>
                  <Button
                    variant="ghost"
                    className="justify-start font-semibold text-base hover:bg-foreground/5"
                    asChild
                  >
                    <Link
                      href={item.href}
                      onClick={(e) => handleSmoothScroll(e, item.href)}
                    >
                      {item.label}
                    </Link>
                  </Button>
                </SheetClose>
              ))}
            </div>

            <Separator className="my-2 bg-foreground/10" />

            <SheetFooter className="p-0">
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
                  <Link
                    href="#contact"
                    onClick={(e) => {
                      e.preventDefault();
                      document
                        .querySelector('#contact')
                        ?.scrollIntoView({ behavior: 'smooth' });
                    }}
                  >
                    Contact Us
                  </Link>
                </Button>
              </SheetClose>
            </SheetFooter>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export default function Navbar() {
  return (
    <SharedNavbar
      customLogoLink={
        <Link
          href="/"
          scroll={false}
          onClick={(e) => {
            e.preventDefault();
            window.scrollTo({
              top: 0,
              behavior: 'smooth',
            });
          }}
          className="flex flex-none items-center gap-2"
        >
          <Image
            src="/monkey-mascot.png"
            className="h-14 w-auto md:h-16 lg:h-20"
            width={350}
            height={100}
            alt="NEO League Logo"
          />
        </Link>
      }
      navigationMenu={<DesktopNavLinks />}
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
