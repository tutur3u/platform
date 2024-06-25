import { locales } from './config';
import { getRequestConfig } from 'next-intl/server';
import { notFound } from 'next/navigation';

const getConfig = getRequestConfig(async ({ locale }) => {
  // Validate that the incoming `locale` parameter is valid
  if (!locales.includes(locale as any)) notFound();

  return {
    messages: (
      await (locale === 'en'
        ? // When using Turbopack, this will enable HMR for `en`
          import('../messages/en.json')
        : import(`../messages/${locale}.json`))
    ).default,
  };
}) as any;
//?    ^ `as any` is needed here to avoid the TypeScript error: The inferred type of 'getConfig' cannot be named
//? without a reference to '../node_modules/next-intl/dist/types/src/server/react-server/getRequestConfig'. This
//? is likely not portable. A type annotation is necessary.

export default getConfig;
