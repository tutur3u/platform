'use client';

import { Check, Hexagon } from '@tuturuuu/icons';
import { DropdownMenuItem } from '@tuturuuu/ui/dropdown-menu';
import { setCookie } from 'cookies-next';
import { useRouter } from 'next/navigation';
import { LOCALE_COOKIE_NAME } from '@/constants/common';

interface Props {
  label: string;
  locale: string;
  selected?: boolean;
}

export function LanguageDropdownItem({ label, locale, selected }: Props) {
  const router = useRouter();

  const useLocale = () => {
    setCookie(LOCALE_COOKIE_NAME, locale);
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
