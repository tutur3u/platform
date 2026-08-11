import { notFound } from 'next/navigation';

export function resolveRequestLocale<const Locale extends string>(
  locales: readonly Locale[],
  locale: string | undefined,
  defaultLocale: Locale
): Locale {
  return locales.includes(locale as Locale)
    ? (locale as Locale)
    : defaultLocale;
}

export async function resolveRootLocale<const Locale extends string>(
  locales: readonly Locale[],
  locale?: string
): Promise<Locale> {
  if (!locales.includes(locale as Locale)) {
    notFound();
  }

  return locale as Locale;
}
