import { LanguageDropdownWrapper } from '@tuturuuu/ui/custom/language-dropdown-wrapper';
import { setCookie } from 'cookies-next';
import { LOCALE_COOKIE_NAME } from '@/constants/common';
import { supportedLocales } from '@/i18n/routing';

interface Props {
  label: string;
  locale: string;
  currentLocale: string | undefined;
}

const handleLocaleChange = (newLocale: string) => {
  setCookie(LOCALE_COOKIE_NAME, newLocale);
};

export function LanguageWrapper({ label, locale, currentLocale }: Props) {
  return (
    <LanguageDropdownWrapper
      label={label}
      locale={locale}
      currentLocale={currentLocale}
      supportedLocales={supportedLocales}
      onLocaleChange={handleLocaleChange}
    />
  );
}
