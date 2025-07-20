import { LanguageToggle } from './language-toggle';
import { cookies as c } from 'next/headers';

export async function LanguageWrapper({
  cookieName,
  defaultLocale,
  supportedLocales,
}: {
  cookieName: string;
  defaultLocale: string;
  supportedLocales: string[] | readonly string[];
}) {
  const cookies = await c();
  const currentLocale = cookies.get(cookieName)?.value;

  const locale =
    currentLocale && supportedLocales.includes(currentLocale)
      ? currentLocale
      : defaultLocale;

  if (!locale) return null;
  return <LanguageToggle currentLocale={locale} />;
}
