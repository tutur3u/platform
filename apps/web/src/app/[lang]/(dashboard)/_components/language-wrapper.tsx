import { LOCALE_COOKIE_NAME } from '@/constants/common';
import { LanguageDropdownItem } from './language-dropdown-item';
import { cookies as c } from 'next/headers';

interface Props {
  label: string;
  locale?: string;
}

export async function LanguageWrapper({ label, locale }: Props) {
  const cookies = c();
  const currentLocale = cookies.get(LOCALE_COOKIE_NAME)?.value;

  const isCurrentLocale = locale === currentLocale;
  const isSource = isCurrentLocale === undefined;

  return (
    <LanguageDropdownItem
      label={label}
      locale={locale}
      disabled={isCurrentLocale || isSource}
    />
  );
}
