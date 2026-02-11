import { LanguageDropdownItem } from './language-dropdown-item';

interface Props {
  label: string;
  locale: string;
  currentLocale: string | undefined;
  supportedLocales: readonly string[];
  onLocaleChange?: (locale: string) => Promise<void> | void;
}

export function LanguageDropdownWrapper({
  label,
  locale,
  currentLocale,
  supportedLocales,
  onLocaleChange,
}: Props) {
  const isLocaleSupported = currentLocale
    ? supportedLocales.includes(currentLocale)
    : true; // user is using system locale

  const isCurrentLocale = isLocaleSupported
    ? locale === currentLocale
    : locale === 'en';

  return (
    <LanguageDropdownItem
      label={label}
      locale={locale}
      selected={isCurrentLocale}
      onLocaleChange={onLocaleChange}
    />
  );
}
