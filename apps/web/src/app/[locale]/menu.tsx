'use client';

import { AuthButton } from './auth-button';
import { PUBLIC_PATHS } from '@/constants/common';
import { SupabaseUser } from '@ncthub/supabase/next/user';
import { WorkspaceUser } from '@ncthub/types/primitives/WorkspaceUser';
import { ThemeToggle } from '@ncthub/ui/custom/theme-toggle';
import { MenuIcon } from '@ncthub/ui/icons';
import { Separator } from '@ncthub/ui/separator';
import { Sheet, SheetContent, SheetTrigger } from '@ncthub/ui/sheet';
import { cn } from '@ncthub/utils/format';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

interface MenuProps {
  sbUser: SupabaseUser | null;
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
    { href: '/about', label: t('common.about') },
    { href: '/projects', label: t('common.projects') },
    { href: '/neo-crush', label: 'Neo Crush' },
    { href: '/neo-chess', label: 'Neo Chess' },
    { href: '/calendar/meet-together', label: t('common.meet-together') },
  ] as NavItem[];
};

const NavLink: React.FC<NavLinkProps> = ({ item, onClick, className }) => {
  const pathname = usePathname();
  const isActive = pathname === item.href;

  const linkProps = {
    href: item.href,
    className: cn(
      'transition-opacity duration-200',
      isActive ? 'opacity-100' : 'opacity-70 hover:opacity-100',
      className
    ),
    onClick: onClick,
    ...(item.external && { target: '_blank', rel: 'noopener noreferrer' }),
  };

  return <Link {...linkProps}>{item.label}</Link>;
};

const DesktopMenu: React.FC<{ t: any }> = ({ t }) => {
  return (
    <div className="hidden w-full items-center rounded-2xl border-[0.5px] border-gray-700/50 bg-primary-foreground px-6 py-3 font-semibold md:flex md:gap-6 lg:gap-8">
      {navItems(t).map((item) => (
        <NavLink
          key={item.href}
          item={item}
          className="md:text-sm lg:text-base"
        />
      ))}
    </div>
  );
};

const MobileNavLink: React.FC<NavLinkProps> = ({ item, onClick }) => (
  <NavLink
    item={item}
    onClick={onClick}
    className="border-brand-lighzt-blue/20 rounded-lg border bg-brand-light-blue/5 p-2 font-semibold text-brand-light-blue transition hover:bg-brand-light-blue/10"
  />
);

const MobileMenu: React.FC<MenuProps> = ({ sbUser, user, t }) => {
  const [isOpened, setIsOpened] = useState(false);
  const closeMenu = () => setIsOpened(false);

  return (
    <Sheet open={isOpened} onOpenChange={setIsOpened}>
      <SheetTrigger className="rounded-lg border border-brand-light-blue/20 bg-brand-light-blue/5 p-2 font-semibold text-brand-light-blue transition hover:bg-brand-light-blue/10">
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
