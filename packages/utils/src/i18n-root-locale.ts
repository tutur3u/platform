import { notFound } from 'next/navigation';
import * as rootParams from 'next/root-params';

export async function resolveRootLocale<const Locale extends string>(
  locales: readonly Locale[],
  localeOverride?: string
): Promise<Locale> {
  const locale = localeOverride ?? (await rootParams.locale());

  if (!locales.includes(locale as Locale)) {
    notFound();
  }

  return locale as Locale;
}
