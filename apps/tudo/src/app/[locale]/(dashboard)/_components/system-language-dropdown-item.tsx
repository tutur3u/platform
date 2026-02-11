'use client';

import { Check, Monitor } from '@tuturuuu/icons';
import { DropdownMenuItem } from '@tuturuuu/ui/dropdown-menu';
import { deleteCookie } from 'cookies-next';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { LOCALE_COOKIE_NAME } from '@/constants/common';

interface Props {
  selected?: boolean;
}

export function SystemLanguageDropdownItem({ selected }: Props) {
  const t = useTranslations('common');
  const router = useRouter();

  const useDefaultLocale = () => {
    deleteCookie(LOCALE_COOKIE_NAME);
    router.refresh();
  };

  return (
    <DropdownMenuItem
      className="cursor-pointer"
      onClick={useDefaultLocale}
      disabled={selected}
    >
      {selected ? (
        <Check className="h-4 w-4" />
      ) : (
        <Monitor className="h-4 w-4" />
      )}
      {t('system')}
    </DropdownMenuItem>
  );
}
