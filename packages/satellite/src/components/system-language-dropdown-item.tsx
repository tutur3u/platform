'use client';

import { SystemLanguageDropdownItem as SharedSystemLanguageDropdownItem } from '@tuturuuu/ui/custom/system-language-dropdown-item';
import { deleteCookie } from 'cookies-next';
import { LOCALE_COOKIE_NAME } from '../constants/common';

interface Props {
  selected?: boolean;
}

export function SystemLanguageDropdownItem({ selected }: Props) {
  const handleResetLocale = () => {
    deleteCookie(LOCALE_COOKIE_NAME);
  };

  return (
    <SharedSystemLanguageDropdownItem
      selected={selected}
      onResetLocale={handleResetLocale}
    />
  );
}
