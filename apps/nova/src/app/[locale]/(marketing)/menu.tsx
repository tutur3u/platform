'use client';

import { MenuIcon } from '@tuturuuu/icons';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { ThemeToggle } from '@tuturuuu/ui/custom/theme-toggle';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@tuturuuu/ui/sheet';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AuthButton } from './auth-button';
import { type NavItem, useNavigation } from './shared/navigation-config';

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
      isActive ? 'opacity-100' : 'opacity-50 hover:opacity-100',
      className
    ),
    onClick: onClick,
    ...(item.external && { target: '_blank', rel: 'noopener noreferrer' }),
  };

  return (
    <Link {...linkProps}>
      <span className="flex items-center gap-2">
        {item.icon}
        {item.label}
        {item.badge && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary text-xs">
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

  const { categories } = useNavigation(t);

  // Extract categories by their titles
  const mainLinks = categories.find((cat) => cat.title === 'main')?.items || [];

  const resources =
    categories.find((cat) => cat.title === 'resources')?.items || [];
  const company =
    categories.find((cat) => cat.title === 'company')?.items || [];

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
                    <span className="font-semibold text-sm">
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

                {/* Company Section */}
                <AccordionItem value="company" className="border-none px-4">
                  <AccordionTrigger className="rounded-lg px-4 py-3 transition-all hover:bg-accent active:bg-accent/80 data-[state=open]:bg-accent/50">
                    <span className="font-semibold text-sm">
                      {t('common.company')}
                    </span>
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
    <div className="flex gap-2 md:hidden">
      <MobileMenu sbUser={sbUser} user={user} t={t} />
    </div>
  );
};

export default Menu;
