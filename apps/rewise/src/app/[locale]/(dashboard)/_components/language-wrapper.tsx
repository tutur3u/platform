import { LanguageDropdownItem } from './language-dropdown-item';
import { locales } from '@/config';
import { LOCALE_COOKIE_NAME } from '@/constants/common';
import { cookies as c } from 'next/headers';

interface Props {
  label: string;
  locale: string;
}

export async function LanguageWrapper({ label, locale }: Props) {
  const cookies = await c();
  const currentLocale = cookies.get(LOCALE_COOKIE_NAME)?.value;

  const isLocaleSupported = currentLocale
    ? locales.includes(currentLocale as any)
    : true; // user is using system locale

  const isCurrentLocale = isLocaleSupported
    ? locale === currentLocale
    : locale === 'en';

  return (
    <LanguageDropdownItem
      label={label}
      locale={locale}
      selected={isCurrentLocale}
    />
  );
}
