import { createContext, type ReactNode, use, useMemo } from 'react';
import { createTranslator, type Locale, type Translate } from './messages';

interface I18n {
  locale: Locale;
  t: Translate;
}

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  const value = useMemo(
    () => ({ locale, t: createTranslator(locale) }),
    [locale]
  );
  return <I18nContext value={value}>{children}</I18nContext>;
}

export function useI18n() {
  const value = use(I18nContext);
  if (!value) throw new Error('I18nProvider is missing');
  return value;
}
