'use client';

import { Check, Monitor } from '@tuturuuu/icons';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { DropdownMenuItem } from '../dropdown-menu';

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

    // Default: API-based locale reset (web pattern)
    const res = await fetch('/api/v1/infrastructure/languages', {
      method: 'DELETE',
    });

    if (res.ok) router.refresh();
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
