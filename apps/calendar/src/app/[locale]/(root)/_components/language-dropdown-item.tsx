'use client';

import { DropdownMenuItem } from '@tuturuuu/ui/dropdown-menu';
import { Check, Hexagon } from '@tuturuuu/ui/icons';
import { useRouter } from 'next/navigation';

interface Props {
  label: string;
  locale: string;
  selected?: boolean;
}

export function LanguageDropdownItem({ label, locale, selected }: Props) {
  const router = useRouter();

  const useLocale = async () => {
    const res = await fetch('/api/v1/infrastructure/languages', {
      method: 'POST',
      body: JSON.stringify({ locale }),
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (res.ok) router.refresh();
  };

  return (
    <DropdownMenuItem
      className="cursor-pointer rounded-md px-3 py-2 text-sm font-medium transition-all duration-200 hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/20 dark:hover:text-blue-300"
      onClick={useLocale}
      disabled={selected}
    >
      <div className="flex items-center gap-3">
        {selected ? (
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-white">
            <Check className="h-3 w-3" />
          </div>
        ) : (
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-900/20 dark:text-green-400">
            <Hexagon className="h-3 w-3" />
          </div>
        )}
        <span>{label}</span>
      </div>
    </DropdownMenuItem>
  );
}
