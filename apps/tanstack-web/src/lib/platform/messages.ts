import enMessages from '../../messages/en.json';
import viMessages from '../../messages/vi.json';
import { defaultLocale, isSupportedLocale, type Locale } from './locale';

const messagesByLocale = {
  en: enMessages,
  vi: viMessages,
} as const;

export type AppMessages = typeof enMessages;
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
