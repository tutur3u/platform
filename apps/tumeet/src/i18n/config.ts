export const locales = ['en', 'vi'] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';

export const getLocaleFromHeader = (acceptLanguage: string) => {
  const match = acceptLanguage.match(/^[a-z]{2}/);
  return match ? match[0] : defaultLocale;
};
