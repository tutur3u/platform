'use client';

import { LogOut } from '@tuturuuu/icons';
import { DropdownMenuItem } from '@tuturuuu/ui/dropdown-menu';
import { useTranslations } from 'next-intl';
import { useAccountSwitcher } from '@/context/account-switcher-context';

export function LogoutDropdownItem() {
  const t = useTranslations('common');
  const { logout } = useAccountSwitcher();

  return (
    <DropdownMenuItem onClick={logout} className="cursor-pointer">
      <LogOut className="mr-2 h-4 w-4" />
      {t('logout')}
    </DropdownMenuItem>
  );
}
