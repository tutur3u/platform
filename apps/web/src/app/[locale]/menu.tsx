'use client';

import { AuthButton } from './auth-button';
import { ThemeToggle } from './theme-toggle';
import { cn } from '@/lib/utils';
import { WorkspaceUser } from '@/types/primitives/WorkspaceUser';
import {
  Sheet,
  SheetContent,
  SheetTitle,
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
  badge?: string;
}

const navItems = (t: any) => {
  return [
    // Main Links
    { href: '/', label: t('common.home') },
    { href: '/meet-together', label: t('common.meet-together') },

    // Products
    {
      href: '/products/ai',
      label: t('common.ai-assistant'),
      badge: t('common.coming_soon'),
    },
    {
      href: '/products/lms',
      label: t('common.lms'),
      badge: t('common.coming_soon'),
    },
    {
      href: '/products/calendar',
      label: t('common.calendar'),
      badge: t('common.coming_soon'),
    },
    {
      href: '/products/documents',
      label: t('common.documents'),
      badge: t('common.coming_soon'),
    },
    {
      href: '/products/drive',
      label: t('common.drive'),
      badge: t('common.coming_soon'),
    },
    {
      href: '/products/crm',
      label: t('common.crm'),
      badge: t('common.coming_soon'),
    },
    {
      href: '/products/inventory',
      label: t('common.inventory'),
      badge: t('common.coming_soon'),
    },
    {
      href: '/products/finance',
      label: t('common.finance'),
      badge: t('common.coming_soon'),
    },
    {
      href: '/products/mail',
      label: t('common.mail'),
      badge: t('common.coming_soon'),
    },
    {
      href: '/products/tasks',
      label: t('common.tasks'),
      badge: t('common.coming_soon'),
    },
    {
      href: '/products/workflows',
      label: t('common.workflows'),
      badge: t('common.coming_soon'),
    },

    // Solutions
    { href: '/solutions/manufacturing', label: t('common.manufacturing') },
    { href: '/solutions/restaurants', label: t('common.restaurants') },
    { href: '/solutions/pharmacies', label: t('common.pharmacies') },
    { href: '/solutions/realestate', label: t('common.realestate') },
    { href: '/solutions/retail', label: t('common.retail') },
    { href: '/solutions/education', label: t('common.education') },
    { href: '/solutions/hospitality', label: t('common.hospitality') },
    { href: '/solutions/construction', label: t('common.construction') },

    // Resources
    { href: '/blog', label: t('common.blog'), badge: t('common.coming_soon') },
    { href: '/changelog', label: t('common.changelog') },
    { href: '/pitch', label: t('common.pitch') },
    { href: '/branding', label: t('common.branding') },
    {
      href: 'https://docs.tuturuuu.com',
      label: t('common.documentation'),
      external: true,
    },
    {
      href: 'https://github.com/tutur3u',
      label: 'GitHub',
      external: true,
    },

    // Company
    { href: '/pricing', label: t('common.pricing') },
    { href: '/about', label: t('common.about') },
    {
      href: '/careers',
      label: t('common.careers'),
    },
    { href: '/contact', label: t('common.contact') },
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

  return (
    <Link {...linkProps}>
      <span className="flex items-center gap-2">
        {item.label}
        {item.badge && (
          <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs">
            {item.badge}
          </span>
        )}
      </span>
    </Link>
  );
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
  <NavLink item={item} onClick={onClick} />
);

const MobileMenu: React.FC<MenuProps> = ({ sbUser, user, t }) => {
  const [isOpened, setIsOpened] = useState(false);
  const closeMenu = () => setIsOpened(false);

  const items = navItems(t);
  const mainLinks = items.slice(0, 2);
  const products = items.filter((item) => item.href.startsWith('/products'));
  const solutions = items.filter((item) => item.href.startsWith('/solutions'));
  const resources = items.filter(
    (item) =>
      item.href.startsWith('/blog') ||
      item.href.startsWith('/changelog') ||
      item.href.startsWith('/pitch') ||
      item.href.startsWith('/branding') ||
      item.href.startsWith('https://')
  );
  const company = items.filter((item) =>
    ['/pricing', '/about', '/careers', '/contact'].includes(item.href)
  );

  return (
    <Sheet open={isOpened} onOpenChange={setIsOpened}>
      <SheetTrigger className="hover:bg-accent rounded-lg p-2 transition-colors">
        <MenuIcon className="h-5 w-5" />
      </SheetTrigger>

      <SheetContent side="right" className="w-full border-l p-0 md:hidden">
        <SheetTitle />
        <div className="flex h-full flex-col">
          {/* Header with Auth and Theme */}
          <div className="border-b px-4 py-6">
            <div className={cn('items-center gap-2', user ? 'grid' : 'flex')}>
              <AuthButton
                user={sbUser}
                className="w-full items-center justify-center"
                onClick={closeMenu}
              />
              {!user && <ThemeToggle forceDisplay />}
            </div>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto">
            <div className="flex flex-col gap-6 px-4 py-6">
              {/* Main Links */}
              <div className="grid gap-2 font-medium">
                {mainLinks.map((item) => (
                  <MobileNavLink
                    key={item.href}
                    item={item}
                    onClick={closeMenu}
                  />
                ))}
              </div>

              {/* Products Section */}
              <div className="grid gap-2">
                <div className="text-foreground/60 text-sm font-semibold">
                  Products
                </div>
                <div className="grid gap-2 font-medium">
                  {products.map((item) => (
                    <MobileNavLink
                      key={item.href}
                      item={item}
                      onClick={closeMenu}
                    />
                  ))}
                </div>
              </div>

              {/* Solutions Section */}
              <div className="grid gap-2">
                <div className="text-foreground/60 text-sm font-semibold">
                  Solutions
                </div>
                <div className="grid gap-2 font-medium">
                  {solutions.map((item) => (
                    <MobileNavLink
                      key={item.href}
                      item={item}
                      onClick={closeMenu}
                    />
                  ))}
                </div>
              </div>

              {/* Resources Section */}
              <div className="grid gap-2">
                <div className="text-foreground/60 text-sm font-semibold">
                  Resources
                </div>
                <div className="grid gap-2 font-medium">
                  {resources.map((item) => (
                    <MobileNavLink
                      key={item.href}
                      item={item}
                      onClick={closeMenu}
                    />
                  ))}
                </div>
              </div>

              {/* Company Section */}
              <div className="grid gap-2">
                <div className="text-foreground/60 text-sm font-semibold">
                  Company
                </div>
                <div className="grid gap-2 font-medium">
                  {company.map((item) => (
                    <MobileNavLink
                      key={item.href}
                      item={item}
                      onClick={closeMenu}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
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
