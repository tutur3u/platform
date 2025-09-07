'use client';

import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { ThemeToggle } from '@tuturuuu/ui/custom/theme-toggle';
import { MenuIcon } from '@tuturuuu/ui/icons';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@tuturuuu/ui/sheet';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AuthButton } from './auth-button';

interface MenuProps {
  sbUser: SupabaseUser | null;
  user: WorkspaceUser | null;
  t?: (key: string) => string;
}

const MobileMenu: React.FC<MenuProps> = ({ sbUser, user, t }) => {
  const [isOpened, setIsOpened] = useState(false);
  const closeMenu = () => setIsOpened(false);

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
