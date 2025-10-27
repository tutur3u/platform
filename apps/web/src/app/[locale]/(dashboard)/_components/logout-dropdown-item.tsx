'use client';

import { useAccountSwitcher } from '@/context/account-switcher-context';
import { LogOut } from '@tuturuuu/icons';
import { DropdownMenuItem } from '@tuturuuu/ui/dropdown-menu';
import { useTranslations } from 'next-intl';

export function LogoutDropdownItem() {
  const t = useTranslations('common');
  const { logout } = useAccountSwitcher();

  return (
    <DropdownMenuItem onClick={logout} className="cursor-pointer">
      <LogOut className="h-4 w-4 text-dynamic-red" />
      <span>{t('logout')}</span>
    </DropdownMenuItem>
  );
}
