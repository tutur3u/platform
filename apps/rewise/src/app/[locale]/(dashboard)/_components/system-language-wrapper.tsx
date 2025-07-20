import { SystemLanguageDropdownItem } from './system-language-dropdown-item';
import { LOCALE_COOKIE_NAME } from '@/constants/common';
import { cookies as c } from 'next/headers';

export async function SystemLanguageWrapper() {
  const cookies = await c();
  const currentLocale = cookies.get(LOCALE_COOKIE_NAME)?.value;
  return <SystemLanguageDropdownItem selected={!currentLocale} />;
}
