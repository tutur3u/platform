'use client';

import { Check, Hexagon } from '@tuturuuu/icons';
import { useRouter } from 'next/navigation';
import { DropdownMenuItem } from '../dropdown-menu';

interface Props {
  label: string;
  locale: string;
  selected?: boolean;
  onLocaleChange?: (locale: string) => Promise<void> | void;
}

export function LanguageDropdownItem({
  label,
  locale,
  selected,
  onLocaleChange,
}: Props) {
  const router = useRouter();

  const useLocale = async () => {
    if (onLocaleChange) {
      await onLocaleChange(locale);
      router.refresh();
      return;
    }

    // Default: API-based locale change (web pattern)
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
      className="cursor-pointer"
      onClick={useLocale}
      disabled={selected}
    >
      {selected ? (
        <Check className="h-4 w-4 text-dynamic-indigo" />
      ) : (
        <Hexagon className="h-4 w-4 text-dynamic-indigo" />
      )}
      {label}
    </DropdownMenuItem>
  );
}
