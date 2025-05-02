import { routing } from './routing';
import { type DateTimeFormatOptions, hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';

export type IntlFormats = {
  dateTime: {
    short: Record<string, DateTimeFormatOptions>;
  };
  number: {
    precise: {
      maximumFractionDigits: number;
    };
  };
  list: {
    enumeration: Record<string, string>;
  };
};

export default getRequestConfig(async ({ requestLocale }) => {
  // This typically corresponds to the `[locale]` segment
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    formats: {
      dateTime: {
        short: {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        },
      },
      number: {
        precise: {
          maximumFractionDigits: 5,
        },
      },
      list: {
        enumeration: {
          style: 'long',
          type: 'conjunction',
        },
      },
    } as IntlFormats,
  };
});
