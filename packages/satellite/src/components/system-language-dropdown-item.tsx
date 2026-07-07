'use client';

import { SystemLanguageDropdownItem as SharedSystemLanguageDropdownItem } from '@tuturuuu/ui/custom/system-language-dropdown-item';
import { getSharedAndHostOnlyCookieDeleteOptions } from '@tuturuuu/utils/shared-cookie';
import { deleteCookie } from 'cookies-next';
import { LOCALE_COOKIE_NAME } from '../constants/common';

interface Props {
  selected?: boolean;
}

export function SystemLanguageDropdownItem({ selected }: Props) {
  const handleResetLocale = () => {
    for (const options of getSharedAndHostOnlyCookieDeleteOptions({
      path: '/',
      sameSite: 'lax',
    })) {
      deleteCookie(LOCALE_COOKIE_NAME, options);
    }
  };

  return (
    <SharedSystemLanguageDropdownItem
      selected={selected}
      onResetLocale={handleResetLocale}
    />
  );
}
