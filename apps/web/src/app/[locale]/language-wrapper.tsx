import { LanguageToggle } from './language-toggle';
import { defaultLocale, locales } from '@/config';
import { LOCALE_COOKIE_NAME } from '@/constants/common';
import { cookies as c } from 'next/headers';

export async function LanguageWrapper() {
  const cookies = await c();
  const currentLocale = cookies.get(LOCALE_COOKIE_NAME)?.value;
  const locale = locales.includes(currentLocale as any)
    ? currentLocale
    : defaultLocale;

  return <LanguageToggle currentLocale={locale as (typeof locales)[number]} />;
}
