'use client';

import { AuthButton } from './auth-button';
import { NavItem, useNavigation } from './shared/navigation-config';
import { SupabaseUser } from '@ncthub/supabase/next/user';
import { WorkspaceUser } from '@ncthub/types/primitives/WorkspaceUser';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@ncthub/ui/accordion';
import { ThemeToggle } from '@ncthub/ui/custom/theme-toggle';
import { MenuIcon } from '@ncthub/ui/icons';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@ncthub/ui/sheet';
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

  const { categories } = useNavigation(t);

  // Extract categories by their titles
  const mainLinks = categories.find((cat) => cat.title === 'main')?.items || [];
  const resources =
    categories.find((cat) => cat.title === 'resources')?.items || [];
  const products =
    categories.find((cat) => cat.title === 'products')?.items || [];
  const games = categories.find((cat) => cat.title === 'games')?.items || [];

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
                {/* Resources Section */}
                <AccordionItem value="resources" className="border-none px-4">
                  <AccordionTrigger className="rounded-lg px-4 py-3 transition-all hover:bg-accent active:bg-accent/80 data-[state=open]:bg-accent/50">
                    <span className="text-sm font-semibold">
                      {t('common.resources')}
                    </span>
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

                {/* Products Section */}
                <AccordionItem value="products" className="border-none px-4">
                  <AccordionTrigger className="rounded-lg px-4 py-3 transition-all hover:bg-accent active:bg-accent/80 data-[state=open]:bg-accent/50">
                    <span className="text-sm font-semibold">
                      {t('common.products')}
                    </span>
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

                {/* Games Section */}
                <AccordionItem value="games" className="border-none px-4">
                  <AccordionTrigger className="rounded-lg px-4 py-3 transition-all hover:bg-accent active:bg-accent/80 data-[state=open]:bg-accent/50">
                    <span className="text-sm font-semibold">
                      {t('common.games')}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pt-3 pb-2">
                    <div className="grid gap-2 px-2">
                      {games.map((item) => (
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
    <div className="flex gap-2 md:hidden">
      <MobileMenu sbUser={sbUser} user={user} t={t} />
    </div>
  );
};

export default Menu;
