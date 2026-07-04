import enMessages from '../../../../web/messages/en.json';
import viMessages from '../../../../web/messages/vi.json';
import {
  defaultLocale,
  isSupportedLocale,
  type Locale,
} from '../../lib/platform/locale';

const messagesByLocale = {
  en: enMessages,
  vi: viMessages,
} as const;

export type UiDocsMessages = (typeof enMessages)['ui-showcase'];
export type UiDocsNamespace = keyof UiDocsMessages;
export type UiDocsTranslator = (
  key: string,
  values?: Record<string, string | number>
) => string;

export function resolveUiDocsLocale(locale: unknown): Locale {
  return isSupportedLocale(locale) ? locale : defaultLocale;
}

export function getUiDocsMessages(locale: unknown): UiDocsMessages {
  return messagesByLocale[resolveUiDocsLocale(locale)]['ui-showcase'];
}

export function createUiDocsTranslator(
  locale: unknown,
  namespace: UiDocsNamespace
): UiDocsTranslator {
  const messages = getUiDocsMessages(locale)[namespace];

  return (key, values) => {
    const value = key
      .split('.')
      .reduce<unknown>(
        (current, segment) =>
          typeof current === 'object' && current !== null
            ? (current as Record<string, unknown>)[segment]
            : undefined,
        messages
      );

    if (typeof value !== 'string') return key;

    return Object.entries(values ?? {}).reduce(
      (text, [name, replacement]) =>
        text.replaceAll(`{${name}}`, String(replacement)),
      value
    );
  };
}
