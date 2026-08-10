import { resolveRootLocale } from '@tuturuuu/utils/i18n-root-locale';
import type { DateTimeFormatOptions } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

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

export default getRequestConfig(async ({ locale: localeOverride }) => {
  const locale = await resolveRootLocale(routing.locales, localeOverride);

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
