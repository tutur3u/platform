'use client';

import { DropdownMenuItem } from '@repo/ui/components/ui/dropdown-menu';
import { Check, Monitor } from 'lucide-react';
import useTranslation from 'next-translate/useTranslation';
import { useRouter } from 'next/navigation';

interface Props {
  selected?: boolean;
}

export function SystemLanguageDropdownItem({ selected }: Props) {
  const { t } = useTranslation('common');
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
        <Check className="mr-2 h-4 w-4" />
      ) : (
        <Monitor className="mr-2 h-4 w-4" />
      )}
      {t('system')}
    </DropdownMenuItem>
  );
}
