import { LanguageDropdownItem } from './language-dropdown-item';
import { supportedLocales } from '@/i18n/routing';

interface Props {
  label: string;
  locale: string;
  currentLocale: string | undefined;
}

export function LanguageWrapper({ label, locale, currentLocale }: Props) {
  const isLocaleSupported = currentLocale
    ? supportedLocales.includes(currentLocale as any)
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
