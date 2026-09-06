import { createContext, useCallback, useContext } from 'react';
import en from '../../messages/en.json';
import vi from '../../messages/vi.json';
export type Locale = 'en' | 'vi';
export const LocaleContext = createContext<Locale>('en');
export const LocalePreferenceContext = createContext<Locale | undefined>(
  undefined
);
export function useCopy() {
  const locale = useContext(LocaleContext);
  return locale === 'vi' ? vi : en;
}
export const appNames = {
  drive: 'Google Drive',
  notion: 'Notion',
  zalo: 'Zalo',
  messenger: 'Messenger',
  teams: 'Microsoft Teams',
  calendar: 'Google Calendar',
  jira: 'Jira',
  trello: 'Trello',
};

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
