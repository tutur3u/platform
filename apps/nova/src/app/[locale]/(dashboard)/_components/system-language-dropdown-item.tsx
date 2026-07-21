'use client';

import { Check, Monitor } from '@tuturuuu/icons';
import { clearLocalePreference } from '@tuturuuu/ui/custom/locale-preference';
import { DropdownMenuItem } from '@tuturuuu/ui/dropdown-menu';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

interface Props {
  selected?: boolean;
}

export function SystemLanguageDropdownItem({ selected }: Props) {
  const t = useTranslations('common');
  const router = useRouter();

  const useDefaultLocale = () => {
    clearLocalePreference();
    router.refresh();
  };

  return (
    <DropdownMenuItem
      className="cursor-pointer"
      onClick={useDefaultLocale}
      disabled={selected}
    >
      {selected ? (
        <Check className="mr-2 h-4 w-4" />
      ) : (
        <Monitor className="mr-2 h-4 w-4" />
      )}
      {t('system')}
    </DropdownMenuItem>
  );
}
