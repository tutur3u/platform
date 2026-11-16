'use client';

import { createLogoutConfirmationUrl } from '@tuturuuu/utils/logout-target';

import { TTR_URL } from '@/constants/common';

import { LogOut } from '@tuturuuu/icons';
import { DropdownMenuItem } from '@tuturuuu/ui/dropdown-menu';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

export function LogoutDropdownItem() {
  const t = useTranslations('common');
  const router = useRouter();

  const logout = () => {
    router.push(
      createLogoutConfirmationUrl({
        centralUrl: TTR_URL,
        appOrigin: window.location.origin,
        locale: document.documentElement.lang,
      })
    );
  };

  return (
    <DropdownMenuItem onClick={logout} className="cursor-pointer">
      <LogOut className="mr-2 h-4 w-4" />
      <span>{t('logout')}</span>
    </DropdownMenuItem>
  );
}
