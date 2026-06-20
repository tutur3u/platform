import enMessages from '../../messages/en.json';
import viMessages from '../../messages/vi.json';
import { defaultLocale, isSupportedLocale, type Locale } from './locale';

const messagesByLocale = {
  en: enMessages as AppMessages,
  vi: viMessages as AppMessages,
} as const;

export type CommonMessages = {
  '404-msg': string;
  'back-to-home': string;
  loading: string;
};
export type AppMessages = typeof enMessages & {
  common: CommonMessages;
};
export type AboutMessages = AppMessages['about'];

export function resolveMessagesLocale(locale: unknown): Locale {
  return isSupportedLocale(locale) ? locale : defaultLocale;
}

export function getMessages(locale: unknown): AppMessages {
  return messagesByLocale[resolveMessagesLocale(locale)];
}

export function getAboutMessages(locale: unknown): AboutMessages {
  return getMessages(locale).about;
}

export function getCommonMessages(locale: unknown): CommonMessages {
  return getMessages(locale).common;
}
