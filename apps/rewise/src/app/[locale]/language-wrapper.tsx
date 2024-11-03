import { LanguageToggle } from './language-toggle';
import { LOCALE_COOKIE_NAME } from '@/constants/common';
import { type Locale, defaultLocale, supportedLocales } from '@/i18n/routing';
import { cookies as c } from 'next/headers';

export async function LanguageWrapper() {
  const cookies = await c();
  const currentLocale = cookies.get(LOCALE_COOKIE_NAME)?.value;
  const locale = supportedLocales.includes(currentLocale as any)
    ? currentLocale
    : defaultLocale;

  return <LanguageToggle currentLocale={locale as Locale} />;
}
