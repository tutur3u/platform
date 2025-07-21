'use client';

import { DropdownMenuItem } from '@tuturuuu/ui/dropdown-menu';
import { LogOut } from '@tuturuuu/ui/icons';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

export function LogoutDropdownItem() {
  const t = useTranslations('common');
  const router = useRouter();

  const logout = async () => {
    await fetch('/api/auth/logout', {
      method: 'POST',
    });
    router.refresh();
  };

  return (
    <DropdownMenuItem
      onClick={logout}
      className="cursor-pointer rounded-md px-3 py-2 text-sm font-medium transition-all duration-200 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/20 dark:hover:text-red-300"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400">
          <LogOut className="h-3 w-3" />
        </div>
        <span>{t('logout')}</span>
      </div>
    </DropdownMenuItem>
  );
}
