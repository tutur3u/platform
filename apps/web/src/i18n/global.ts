import messages from '../messages/en.json';
import { formats } from '@/i18n/request';
import { routing } from '@/i18n/routing';

declare module 'next-intl' {
  // eslint-disable-next-line no-unused-vars
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: typeof messages;
    Formats: typeof formats;
  }
}
