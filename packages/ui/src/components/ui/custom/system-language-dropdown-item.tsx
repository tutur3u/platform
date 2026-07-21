'use client';

import { Check, Monitor } from '@tuturuuu/icons';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { DropdownMenuItem } from '../dropdown-menu';
import { clearLocalePreference } from './locale-preference';

interface Props {
  selected?: boolean;
  onResetLocale?: () => Promise<void> | void;
}

export function SystemLanguageDropdownItem({ selected, onResetLocale }: Props) {
  const t = useTranslations('common');
  const router = useRouter();

  const useDefaultLocale = async () => {
    if (onResetLocale) {
      await onResetLocale();
      router.refresh();
      return;
    }

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
        <Check className="h-4 w-4" />
      ) : (
        <Monitor className="h-4 w-4" />
      )}
      {t('system')}
    </DropdownMenuItem>
  );
}
