'use client';

import { AuthButton } from './auth-button';
import { ThemeToggle } from './theme-toggle';
import { cn } from '@/lib/utils';
import { WorkspaceUser } from '@/types/primitives/WorkspaceUser';
import { Separator } from '@repo/ui/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from '@repo/ui/components/ui/sheet';
import { User } from '@supabase/supabase-js';
import { MenuIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

interface MenuProps {
  sbUser: User | null;
  user: WorkspaceUser | null;
  t?: any;
}

interface NavLinkProps {
  item: NavItem;
  onClick?: () => void;
  className?: string;
}

interface NavItem {
  href: string;
  label: string;
  external?: boolean;
}

const navItems = (t: any) => {
  return [
    { href: '/', label: t('common.home') },
    { href: '/meet-together', label: t('common.meet-together') },
    // {
    //   href: 'https://docs.tuturuuu.com',
    //   label: t('common.docs'),
    //   external: true,
    // },
  ] as NavItem[];
};

const NavLink: React.FC<NavLinkProps> = ({ item, onClick, className }) => {
  const pathname = usePathname();
  const isActive = pathname === item.href;

  const linkProps = {
    href: item.href,
    className: cn(
      'transition-opacity duration-200',
      isActive ? 'opacity-100' : 'opacity-50 hover:opacity-100',
      className
    ),
    onClick: onClick,
    ...(item.external && { target: '_blank', rel: 'noopener noreferrer' }),
  };

  return <Link {...linkProps}>{item.label}</Link>;
};

const DesktopMenu: React.FC<{ t: any }> = () => {
  return <div />;
  // const pathname = usePathname();

  // if (
  //   pathname !== '/' &&
  //   !PUBLIC_PATHS.some((path) => pathname.startsWith(path)) &&
  //   !pathname.startsWith('/settings')
  // )
  //   return null;

  // return (
  //   <div className="hidden gap-8 font-semibold md:flex">
  //     {navItems(t).map((item) => (
  //       <NavLink key={item.href} item={item} />
  //     ))}
  //   </div>
  // );
};

const MobileNavLink: React.FC<NavLinkProps> = ({ item, onClick }) => (
  <NavLink
    item={item}
    onClick={onClick}
    // className="border-brand-light-blue/20 bg-brand-light-blue/5 text-brand-light-blue hover:bg-brand-light-blue/10 rounded-lg border p-2 font-semibold transition"
  />
);

const MobileMenu: React.FC<MenuProps> = ({ sbUser, user, t }) => {
  const [isOpened, setIsOpened] = useState(false);
  const closeMenu = () => setIsOpened(false);

  return (
    <Sheet open={isOpened} onOpenChange={setIsOpened}>
      <SheetTrigger
      //  className="border-brand-light-blue/20 bg-brand-light-blue/5 text-brand-light-blue hover:bg-brand-light-blue/10 rounded-lg border p-2 font-semibold transition"
      >
        <MenuIcon className="h-5 w-5" />
      </SheetTrigger>
      <SheetContent className="md:hidden">
        <div className={cn('mt-6 items-center gap-1', user ? 'grid' : 'flex')}>
          <AuthButton
            user={sbUser}
            className="w-full items-center justify-center"
            onClick={closeMenu}
          />
          {!user && <ThemeToggle forceDisplay />}
        </div>
        <Separator className="my-4" />
        <div className="grid gap-2 text-center font-semibold">
          {navItems(t).map((item) => (
            <MobileNavLink key={item.href} item={item} onClick={closeMenu} />
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
};

const Menu: React.FC<MenuProps> = ({ sbUser, user }) => {
  const t = useTranslations();

  return (
    <>
      <DesktopMenu t={t} />
      <div className="flex gap-2 md:hidden">
        <MobileMenu sbUser={sbUser} user={user} t={t} />
      </div>
    </>
  );
};

export default Menu;
