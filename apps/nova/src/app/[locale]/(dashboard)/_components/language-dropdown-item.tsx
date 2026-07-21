'use client';

import { Check, Hexagon } from '@tuturuuu/icons';
import { persistLocalePreference } from '@tuturuuu/ui/custom/locale-preference';
import { DropdownMenuItem } from '@tuturuuu/ui/dropdown-menu';
import { useRouter } from 'next/navigation';

interface Props {
  label: string;
  locale: string;
  selected?: boolean;
}

export function LanguageDropdownItem({ label, locale, selected }: Props) {
  const router = useRouter();

  const useLocale = () => {
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
        <Check className="mr-2 h-4 w-4" />
      ) : (
        <Hexagon className="mr-2 h-4 w-4" />
      )}
      {label}
    </DropdownMenuItem>
  );
}
