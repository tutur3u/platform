'use client';

import { LogOut } from '@tuturuuu/icons';
import { DropdownMenuItem } from '@tuturuuu/ui/dropdown-menu';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

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
    <DropdownMenuItem onClick={logout} className="cursor-pointer">
      <LogOut className="mr-2 h-4 w-4" />
      <span>{t('logout')}</span>
    </DropdownMenuItem>
  );
}
