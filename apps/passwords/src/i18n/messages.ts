import en from '../../messages/en.json';
import vi from '../../messages/vi.json';

export const LOCALES = ['en', 'vi'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

type Messages = typeof en;
type Path<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string
    ? `${Prefix}${K}`
    : Path<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

export type MessageKey = Path<Messages>;
export type Translate = (
  key: MessageKey,
  params?: Record<string, string | number>
) => string;

const bundles: Record<Locale, Messages> = { en, vi };

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

function lookup(messages: Messages, key: string) {
  let node: unknown = messages;
  for (const part of key.split('.'))
    node = (node as Record<string, unknown> | undefined)?.[part];
  return typeof node === 'string' ? node : key;
}

export function createTranslator(locale: Locale): Translate {
  const messages = bundles[locale];
  return (key, params) =>
    lookup(messages, key).replace(/\{(\w+)\}/gu, (_, name: string) =>
      String(params?.[name] ?? `{${name}}`)
    );
}
