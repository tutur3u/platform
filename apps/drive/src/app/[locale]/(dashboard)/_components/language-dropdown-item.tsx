'use client';

import { LanguageDropdownItem as SharedLanguageDropdownItem } from '@tuturuuu/ui/custom/language-dropdown-item';
import { setCookie } from 'cookies-next';
import { LOCALE_COOKIE_NAME } from '@/constants/common';

interface Props {
  label: string;
  locale: string;
  selected?: boolean;
}

export function LanguageDropdownItem({ label, locale, selected }: Props) {
  const handleLocaleChange = (newLocale: string) => {
    setCookie(LOCALE_COOKIE_NAME, newLocale);
  };

  return (
    <SharedLanguageDropdownItem
      label={label}
      locale={locale}
      selected={selected}
      onLocaleChange={handleLocaleChange}
    />
  );
}
