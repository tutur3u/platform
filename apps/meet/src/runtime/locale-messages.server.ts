import type { AbstractIntlMessages } from 'next-intl';
import en from '../../messages/en.json';
import vi from '../../messages/vi.json';

/** Server-side message bundles; the client fetches the active locale instead. */
export function readServerLocaleMessages(locale: string): AbstractIntlMessages {
  return locale === 'vi' ? vi : en;
}
