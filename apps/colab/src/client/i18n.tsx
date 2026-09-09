import { type MockApp, mockAppCatalog } from '@tuturuuu/multiplayer';
import { createContext, useCallback, useContext } from 'react';
import en from '../../messages/en.json';
import vi from '../../messages/vi.json';
export type Locale = 'en' | 'vi';
export const LocaleContext = createContext<Locale>('en');
export const LocalePreferenceContext = createContext<Locale | undefined>(
  undefined
);
export function getMessages(locale: Locale) {
  return locale === 'vi' ? vi : en;
}
export function useCopy() {
  const locale = useContext(LocaleContext);
  return getMessages(locale);
}

function formatMessage(
  template: string,
  values?: Record<string, number | string>
) {
  const withPlurals = template.replace(
    /\{(\w+), plural, one \{# ([^{}]+)\} other \{# ([^{}]+)\}\}/g,
    (match, name: string, one: string, other: string) => {
      const count = Number(values?.[name]);
      if (!Number.isFinite(count)) return match;
      return `${count} ${count === 1 ? one : other}`;
    }
  );
  return withPlurals.replace(/\{(\w+)\}/g, (match, name: string) =>
    String(values?.[name] ?? match)
  );
}

export function useLauncherCopy() {
  const locale = useContext(LocaleContext);
  return useCallback(
    (key: string, values?: Record<string, number | string>) => {
      let value: unknown = getMessages(locale).command_launcher;
      for (const part of key.split('.')) {
        if (!value || typeof value !== 'object') return key;
        value = (value as Record<string, unknown>)[part];
      }
      if (typeof value !== 'string') return key;
      return formatMessage(value, values);
    },
    [locale]
  );
}
export const appNames = Object.fromEntries(
  mockAppCatalog.map(({ id, name }) => [id, name])
) as Record<MockApp, string>;

export function useShellCopy() {
  const c = useCopy();
  return useCallback(
    (key: string, values?: Record<string, string | number>) => {
      const value = c.shell[key as keyof typeof c.shell] ?? key;
      return value.replace(/\{(\w+)\}/g, (match, name: string) =>
        String(values?.[name] ?? match)
      );
    },
    [c.shell]
  );
}
