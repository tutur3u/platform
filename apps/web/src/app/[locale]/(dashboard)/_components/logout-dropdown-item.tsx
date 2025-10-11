'use client';

import { LogOut } from '@tuturuuu/icons';
import { DropdownMenuItem } from '@tuturuuu/ui/dropdown-menu';
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
    <DropdownMenuItem onClick={logout} className="cursor-pointer">
      <LogOut className="h-4 w-4 text-dynamic-red" />
      <span>{t('logout')}</span>
    </DropdownMenuItem>
  );
}
