'use client';

import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { ThemeToggle } from '@tuturuuu/ui/custom/theme-toggle';
import { MenuIcon } from '@tuturuuu/ui/icons';
import { Separator } from '@tuturuuu/ui/separator';
import { Sheet, SheetContent, SheetTrigger } from '@tuturuuu/ui/sheet';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { PUBLIC_PATHS } from '@/constants/common';
import { AuthButton } from './auth-button';

type TranslationFunction = ReturnType<typeof useTranslations>;

interface MenuProps {
  sbUser: SupabaseUser | null;
  user: WorkspaceUser | null;
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

// eslint-disable-next-line no-unused-vars
const navItems = (_: TranslationFunction) => {
  return [
    // { href: '/', label: t('common.home') },
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

const DesktopMenu: React.FC<{ t: TranslationFunction }> = ({ t }) => {
  const pathname = usePathname();

  if (
    pathname !== '/' &&
    !PUBLIC_PATHS.some((path) => pathname.startsWith(path))
  )
    return null;

  return (
    <div className="hidden gap-8 font-semibold md:flex">
      {navItems(t).map((item) => (
        <NavLink key={item.href} item={item} />
      ))}
    </div>
  );
};

const MobileNavLink: React.FC<NavLinkProps> = ({ item, onClick }) => (
  <NavLink
    item={item}
    onClick={onClick}
    className="border-brand-light-blue/20 bg-brand-light-blue/5 text-brand-light-blue hover:bg-brand-light-blue/10 rounded-lg border p-2 font-semibold transition"
  />
);

const MobileMenu: React.FC<MenuProps & { t: TranslationFunction }> = ({
  sbUser,
  user,
  t,
}) => {
  const [isOpened, setIsOpened] = useState(false);
  const closeMenu = () => setIsOpened(false);

  return (
    <Sheet open={isOpened} onOpenChange={setIsOpened}>
      <SheetTrigger className="border-brand-light-blue/20 bg-brand-light-blue/5 text-brand-light-blue hover:bg-brand-light-blue/10 rounded-lg border p-2 font-semibold transition">
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
