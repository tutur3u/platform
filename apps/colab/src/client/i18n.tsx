import { createContext, useContext } from 'react';
import en from '../../messages/en.json';
import vi from '../../messages/vi.json';
export type Locale = 'en' | 'vi';
export const LocaleContext = createContext<Locale>('en');
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
