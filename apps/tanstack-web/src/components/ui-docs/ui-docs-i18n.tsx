import { createContext, type ReactNode, useContext, useMemo } from 'react';
import {
  createUiDocsTranslator,
  resolveUiDocsLocale,
  type UiDocsNamespace,
  type UiDocsTranslator,
} from '../../data/ui-docs/messages';
import type { Locale } from '../../lib/platform/locale';

const UiDocsLocaleContext = createContext<Locale>('en');

export function UiDocsI18nProvider({
  children,
  locale,
}: {
  children: ReactNode;
  locale: unknown;
}) {
  const normalizedLocale = resolveUiDocsLocale(locale);

  return (
    <UiDocsLocaleContext.Provider value={normalizedLocale}>
      {children}
    </UiDocsLocaleContext.Provider>
  );
}

export function useUiDocsLocale() {
  return useContext(UiDocsLocaleContext);
}

export function useUiDocsTranslator(
  namespace: UiDocsNamespace
): UiDocsTranslator {
  const locale = useUiDocsLocale();

  return useMemo(
    () => createUiDocsTranslator(locale, namespace),
    [locale, namespace]
  );
}
