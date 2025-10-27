'use client';

import { useAccountSwitcher } from '@/context/account-switcher-context';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';

export default function LogoutButton() {
  const t = useTranslations('common');
  const { logout } = useAccountSwitcher();

  return (
    <Button
      onClick={logout}
      variant="destructive"
      className="font-semibold text-red-300 hover:text-red-200"
    >
      {t('logout')}
    </Button>
  );
}
