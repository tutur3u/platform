'use client';

import { Check, Hexagon } from '@tuturuuu/icons';
import { useRouter } from 'next/navigation';
import { DropdownMenuItem } from '../dropdown-menu';
import { persistLocalePreference } from './locale-preference';

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

    persistLocalePreference(locale);
    router.refresh();
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
