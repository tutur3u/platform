import { LanguageDropdownWrapper } from '@tuturuuu/ui/custom/language-dropdown-wrapper';
import { supportedLocales } from '@/i18n/routing';

interface Props {
  label: string;
  locale: string;
  currentLocale: string | undefined;
}

export function LanguageWrapper({ label, locale, currentLocale }: Props) {
  return (
    <LanguageDropdownWrapper
      label={label}
      locale={locale}
      currentLocale={currentLocale}
      supportedLocales={supportedLocales}
    />
  );
}
