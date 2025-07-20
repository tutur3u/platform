'use client';

import { DropdownMenuItem } from '@tuturuuu/ui/dropdown-menu';
import { LogOut } from '@tuturuuu/ui/icons';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

export function LogoutDropdownItem() {
  const t = useTranslations('common');
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
      });
      router.refresh();
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  return (
    <DropdownMenuItem onClick={handleLogout} className="cursor-pointer">
      <LogOut className="mr-2 h-4 w-4" />
      {t('logout')}
    </DropdownMenuItem>
  );
}
