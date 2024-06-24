'use client';

import { DropdownMenuItem } from '@repo/ui/components/ui/dropdown-menu';
import { LogOut } from 'lucide-react';
import useTranslation from 'next-translate/useTranslation';
import { useRouter } from 'next/navigation';

export function LogoutDropdownItem() {
  const { t } = useTranslation('common');
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
