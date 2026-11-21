import { createContext, type ReactNode, useContext } from 'react';
import en from '../messages/en.json';
import vi from '../messages/vi.json';

export type Locale = 'en' | 'vi';
export const locales = ['en', 'vi'] as const satisfies readonly Locale[];

type Messages = typeof en.command;
type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string
    ? `${P}${K}`
    : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];
export type MessageKey = Leaves<Messages>;
export type Translate = (
  key: MessageKey,
  values?: Record<string, string | number>
) => string;

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

/** Message lookup with `{name}` interpolation; unknown keys render the key. */
export function translator(locale: Locale): Translate {
  const messages: Messages = (locale === 'vi' ? vi : en).command;
  return (key, values) => {
    let node: unknown = messages;
    for (const part of key.split('.'))
      node = (node as Record<string, unknown> | undefined)?.[part];
    const text = typeof node === 'string' ? node : key;
    return values
      ? text.replace(/\{(\w+)\}/g, (match, name: string) =>
          name in values ? String(values[name]) : match
        )
      : text;
  };
}

const I18n = createContext<{ locale: Locale; t: Translate }>({
  locale: 'en',
  t: translator('en'),
});

export function I18nProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  return <I18n value={{ locale, t: translator(locale) }}>{children}</I18n>;
}

export function useI18n() {
  return useContext(I18n);
}

/**
 * Fleet times render in ICT, the fleet's operating zone, so the Worker's
 * server render and the browser's hydration produce the same text.
 */
export const FLEET_TIME_ZONE = 'Asia/Ho_Chi_Minh';

/** Clock time, e.g. 14:32. */
export function formatTime(locale: Locale, iso: string | number) {
  return new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: FLEET_TIME_ZONE,
  }).format(new Date(iso));
}

/** `12 s`, `3 min`, `2 h`: coarse age for freshness and last-seen labels. */
export function formatAge(t: Translate, ms: number) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return t('age.seconds', { n: seconds });
  if (seconds < 3600) return t('age.minutes', { n: Math.round(seconds / 60) });
  return t('age.hours', { n: Math.round(seconds / 3600) });
}
