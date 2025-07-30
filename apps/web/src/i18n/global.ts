import type messages from '../../messages/en.json';
import type { IntlFormats } from '@/i18n/request';
import type { routing } from '@/i18n/routing';

declare module 'next-intl' {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: typeof messages;
    Formats: IntlFormats;
  }
}
