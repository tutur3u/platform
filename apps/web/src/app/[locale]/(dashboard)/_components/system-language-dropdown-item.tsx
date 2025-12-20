'use client';

import { Check, Monitor } from '@tuturuuu/icons';
import { DropdownMenuItem } from '@tuturuuu/ui/dropdown-menu';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

interface Props {
  selected?: boolean;
}

export function SystemLanguageDropdownItem({ selected }: Props) {
  const t = useTranslations('common');
  const router = useRouter();

  const useDefaultLocale = async () => {
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
