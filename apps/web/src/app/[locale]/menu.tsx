'use client';

import { AuthButton } from './auth-button';
import { ThemeToggle } from './theme-toggle';
import { cn } from '@/lib/utils';
import type { SupabaseUser } from '@tutur3u/supabase/next/user';
import { WorkspaceUser } from '@repo/types/primitives/WorkspaceUser';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@repo/ui/components/ui/accordion';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@repo/ui/components/ui/sheet';
import { MenuIcon } from 'lucide-react';
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
  badge?: string;
}

const navItems = (t: any) => {
  return [
    // Main Links
    { href: '/', label: t('common.home') },

    // Products
    { href: '/meet-together', label: t('common.meet-together') },
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
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
            {item.badge}
          </span>
        )}
      </span>
    </Link>
  );
};

const MobileNavLink: React.FC<NavLinkProps> = ({
  item,
  className,
  onClick,
}) => <NavLink item={item} className={className} onClick={onClick} />;

const MobileMenu: React.FC<MenuProps> = ({ sbUser, user, t }) => {
  const [isOpened, setIsOpened] = useState(false);
  const closeMenu = () => setIsOpened(false);

  const items = navItems(t);
  const mainLinks = items.slice(0, 1); // Only home
  const products = items.filter(
    (item) =>
      item.href === '/meet-together' || item.href.startsWith('/products')
  );
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
      <SheetTrigger className="rounded-lg p-2 transition-all hover:bg-accent active:bg-accent/80">
        <MenuIcon className="h-5 w-5" />
      </SheetTrigger>

      <SheetContent side="right" className="w-full border-l p-0 md:hidden">
        <SheetTitle />
        <div className="flex h-full flex-col">
          {/* Header with Auth and Theme */}
          <div className="border-b px-6 py-6">
            <div className={cn('items-center gap-3', user ? 'grid' : 'flex')}>
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
            <div className="flex flex-col space-y-4 py-6">
              {/* Main Links */}
              <div className="px-6">
                <div className="grid gap-2 font-medium">
                  {mainLinks.map((item) => (
                    <MobileNavLink
                      key={item.href}
                      item={item}
                      onClick={closeMenu}
                      className="rounded-lg px-4 py-2.5 transition-all hover:bg-accent active:bg-accent/80"
                    />
                  ))}
                </div>
              </div>

              <Accordion type="multiple" className="space-y-3">
                {/* Products Section */}
                <AccordionItem value="products" className="border-none px-4">
                  <AccordionTrigger className="rounded-lg px-4 py-3 transition-all hover:bg-accent active:bg-accent/80 data-[state=open]:bg-accent/50">
                    <span className="text-sm font-semibold">Products</span>
                  </AccordionTrigger>
                  <AccordionContent className="pt-3 pb-2">
                    <div className="grid gap-2 px-2">
                      {products.map((item) => (
                        <MobileNavLink
                          key={item.href}
                          item={item}
                          onClick={closeMenu}
                          className="rounded-lg px-4 py-2.5 transition-all hover:bg-accent active:bg-accent/80"
                        />
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* Solutions Section */}
                <AccordionItem value="solutions" className="border-none px-4">
                  <AccordionTrigger className="rounded-lg px-4 py-3 transition-all hover:bg-accent active:bg-accent/80 data-[state=open]:bg-accent/50">
                    <span className="text-sm font-semibold">Solutions</span>
                  </AccordionTrigger>
                  <AccordionContent className="pt-3 pb-2">
                    <div className="grid gap-2 px-2">
                      {solutions.map((item) => (
                        <MobileNavLink
                          key={item.href}
                          item={item}
                          onClick={closeMenu}
                          className="rounded-lg px-4 py-2.5 transition-all hover:bg-accent active:bg-accent/80"
                        />
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* Resources Section */}
                <AccordionItem value="resources" className="border-none px-4">
                  <AccordionTrigger className="rounded-lg px-4 py-3 transition-all hover:bg-accent active:bg-accent/80 data-[state=open]:bg-accent/50">
                    <span className="text-sm font-semibold">Resources</span>
                  </AccordionTrigger>
                  <AccordionContent className="pt-3 pb-2">
                    <div className="grid gap-2 px-2">
                      {resources.map((item) => (
                        <MobileNavLink
                          key={item.href}
                          item={item}
                          onClick={closeMenu}
                          className="rounded-lg px-4 py-2.5 transition-all hover:bg-accent active:bg-accent/80"
                        />
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* Company Section */}
                <AccordionItem value="company" className="border-none px-4">
                  <AccordionTrigger className="rounded-lg px-4 py-3 transition-all hover:bg-accent active:bg-accent/80 data-[state=open]:bg-accent/50">
                    <span className="text-sm font-semibold">Company</span>
                  </AccordionTrigger>
                  <AccordionContent className="pt-3 pb-2">
                    <div className="grid gap-2 px-2">
                      {company.map((item) => (
                        <MobileNavLink
                          key={item.href}
                          item={item}
                          onClick={closeMenu}
                          className="rounded-lg px-4 py-2.5 transition-all hover:bg-accent active:bg-accent/80"
                        />
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
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
      <div className="flex gap-2 md:hidden">
        <MobileMenu sbUser={sbUser} user={user} t={t} />
      </div>
    </>
  );
};

export default Menu;
