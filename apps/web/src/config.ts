import { LocalePrefix, Pathnames } from 'next-intl/routing';

export const defaultLocale = 'en' as const;
export const locales = ['en', 'vi'] as const;
export type Locales = (typeof locales)[number];

export const pathnames: Pathnames<typeof locales> = {
  '/': '/',
  // '/pathnames': {
  //   en: '/pathnames',
  //   vi: '/duong-dan',
  // },
};

export const localePrefix: LocalePrefix<typeof locales> = 'always';

export const port = process.env.PORT || 7803;
export const host = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : `http://localhost:${port}`;
