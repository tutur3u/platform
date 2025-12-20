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
      className="cursor-pointer rounded-md px-3 py-2 font-medium text-sm transition-all duration-200 hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/20 dark:hover:text-blue-300"
      onClick={useDefaultLocale}
      disabled={selected}
    >
      <div className="flex items-center gap-3">
        {selected ? (
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-white">
            <Check className="h-3 w-3" />
          </div>
        ) : (
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-100 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400">
            <Monitor className="h-3 w-3" />
          </div>
        )}
        <span>{t('system')}</span>
      </div>
    </DropdownMenuItem>
  );
}
