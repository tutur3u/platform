import { notFound } from 'next/navigation';

export async function resolveRootLocale<const Locale extends string>(
  locales: readonly Locale[],
  locale?: string
): Promise<Locale> {
  if (!locales.includes(locale as Locale)) {
    notFound();
  }

  return locale as Locale;
}
