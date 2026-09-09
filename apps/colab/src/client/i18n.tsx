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
export function useLauncherCopy() {
  const locale = useContext(LocaleContext);
  return useCallback(
    (key: string, values?: Record<string, number | string>) => {
      if (key === 'apps_count') {
        const count = Number(values?.count ?? 0);
        return locale === 'vi'
          ? `${count} ứng dụng`
          : `${count} ${count === 1 ? 'app' : 'apps'}`;
      }
      let value: unknown = getMessages(locale).command_launcher;
      for (const part of key.split('.')) {
        if (!value || typeof value !== 'object') return key;
        value = (value as Record<string, unknown>)[part];
      }
      if (typeof value !== 'string') return key;
      return value.replace(/\{(\w+)\}/g, (match, name: string) =>
        String(values?.[name] ?? match)
      );
    },
    [locale]
  );
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
  gmail: 'Gmail',
  slack: 'Slack',
  sheets: 'Google Sheets',
  github: 'GitHub',
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
