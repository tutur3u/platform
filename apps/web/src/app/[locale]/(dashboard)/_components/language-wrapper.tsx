import { LanguageDropdownItem } from './language-dropdown-item';
import { locales } from '@/config';

interface Props {
  label: string;
  locale: string;
  currentLocale: string | undefined;
}

export async function LanguageWrapper({ label, locale, currentLocale }: Props) {
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
